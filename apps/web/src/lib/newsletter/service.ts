import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  type ApprovalState,
  buildDnsPlan,
  decideStaffTestSend,
  describeSendingGate,
  type DnsRecord,
  dnsRecordsForStorage,
  type DomainGateSnapshot,
  hashToken,
  NewsletterGateError,
  type NewsletterGateCode,
  normalizeLocalPart,
  normalizeSendingSubdomain,
  normalizeStaffMessage,
  normalizeSubscriberEmail,
  ownershipDnsRecord,
  type SenderGateSnapshot,
  type SesIdentitySnapshot,
  UNSUBSCRIBE_TOKEN_PATTERN,
  createHighEntropyToken,
  assertSingleRecipient,
} from './domain';
import { isNewsletterSendingEnabled } from './flag';
import { getNewsletterMailer, type NewsletterMailer } from './mailer';
import {
  getNewsletterSesIdentityClient,
  type NewsletterSesIdentityClient,
} from './ses';
import { asNewsletterAdmin, callNewsletter, type NewsletterAdmin } from './store';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NewsletterSenderView = SenderGateSnapshot;

export type NewsletterClaimView = DomainGateSnapshot & {
  id: string;
  dnsRecords: DnsRecord[];
  mailFromDomain: string | null;
  senders: NewsletterSenderView[];
};

export type NewsletterClaimCreated = NewsletterClaimView & { token: string };

const APPROVALS = new Set<ApprovalState>([
  'pending',
  'approved',
  'suspended',
  'removed',
]);
const PURPOSES = new Set<DnsRecord['purpose']>([
  'ownership',
  'dkim',
  'mail_from_spf',
  'mail_from_mx',
]);
const DNS_TYPES = new Set<DnsRecord['type']>(['TXT', 'CNAME', 'MX']);

function assertUuid(value: string, code: NewsletterGateCode): void {
  if (!UUID.test(value)) throw new NewsletterGateError(code);
}

async function adminFor(actorId: string | null): Promise<NewsletterAdmin> {
  const auditActorId = actorId && UUID.test(actorId) ? actorId : undefined;
  const admin = await createAdminClient({
    noCookie: true,
    ...(auditActorId ? { auditActorId } : {}),
  });
  return asNewsletterAdmin(admin);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NewsletterGateError('store_failed');
  }
  return value as Record<string, unknown>;
}

function parseApproval(value: unknown): ApprovalState {
  if (typeof value !== 'string' || !APPROVALS.has(value as ApprovalState)) {
    throw new NewsletterGateError('store_failed');
  }
  return value as ApprovalState;
}

function parseRecords(value: unknown): DnsRecord[] {
  if (!Array.isArray(value)) throw new NewsletterGateError('store_failed');
  return value.map((item) => {
    const record = asRecord(item);
    if (
      typeof record.purpose !== 'string' ||
      !PURPOSES.has(record.purpose as DnsRecord['purpose']) ||
      typeof record.host !== 'string' ||
      typeof record.type !== 'string' ||
      !DNS_TYPES.has(record.type as DnsRecord['type']) ||
      !(record.value === null || typeof record.value === 'string')
    ) {
      throw new NewsletterGateError('store_failed');
    }
    return {
      purpose: record.purpose as DnsRecord['purpose'],
      host: record.host,
      type: record.type as DnsRecord['type'],
      value: record.value,
    };
  });
}

function parseSenders(value: unknown): NewsletterSenderView[] {
  if (!Array.isArray(value)) throw new NewsletterGateError('store_failed');
  return value.map((item) => {
    const sender = asRecord(item);
    if (typeof sender.localPart !== 'string') {
      throw new NewsletterGateError('store_failed');
    }
    return {
      localPart: sender.localPart,
      approval: parseApproval(sender.approval),
    };
  });
}

function parseClaimBody(value: unknown): NewsletterClaimView {
  const row = asRecord(value);
  if (typeof row.id !== 'string' || typeof row.subdomain !== 'string') {
    throw new NewsletterGateError('store_failed');
  }
  if (
    typeof row.dkimVerified !== 'boolean' ||
    typeof row.mailFromVerified !== 'boolean' ||
    typeof row.txtVerified !== 'boolean'
  ) {
    throw new NewsletterGateError('store_failed');
  }
  return {
    id: row.id,
    subdomain: row.subdomain,
    approval: parseApproval(row.approval),
    dkimVerified: row.dkimVerified,
    mailFromVerified: row.mailFromVerified,
    txtVerified: row.txtVerified,
    dnsRecords: parseRecords(row.dnsRecords),
    mailFromDomain:
      row.mailFromDomain === null || typeof row.mailFromDomain === 'string'
        ? (row.mailFromDomain as string | null)
        : null,
    senders: parseSenders(row.senders ?? []),
  };
}

export async function readNewsletterClaim(wsId: string): Promise<{
  claim: NewsletterClaimView | null;
  gate: { allowed: boolean; code: NewsletterGateCode | null };
}> {
  assertUuid(wsId, 'not_found');
  const admin = await adminFor(null);
  const data = asRecord(
    await callNewsletter(admin, 'newsletter_read_claim', { p_ws_id: wsId })
  );
  const claim = data.claim == null ? null : parseClaimBody(data.claim);
  const gate = describeSendingGate({
    flagEnabled: await isNewsletterSendingEnabled(wsId),
    domain: claim,
    senders: claim?.senders ?? [],
  });
  return { claim, gate };
}

export async function createNewsletterClaim(input: {
  wsId: string;
  actorId: string;
  subdomain: string;
  ses?: NewsletterSesIdentityClient | null;
}): Promise<NewsletterClaimCreated> {
  assertUuid(input.wsId, 'not_found');
  assertUuid(input.actorId, 'store_failed');
  const subdomain = normalizeSendingSubdomain(input.subdomain);
  const token = createHighEntropyToken();
  const tokenHash = hashToken(token);
  const ses =
    input.ses === undefined ? getNewsletterSesIdentityClient() : input.ses;
  let records: DnsRecord[];
  let dkimVerified = false;
  let mailFromVerified = false;
  let txtVerified = false;
  let mailFromDomain: string | null = null;
  let writeVerify = false;
  if (ses) {
    let snapshot: SesIdentitySnapshot | null;
    try {
      snapshot = await ses.describeIdentity(subdomain);
    } catch {
      throw new NewsletterGateError('ses_records');
    }
    if (!snapshot) throw new NewsletterGateError('ses_records');
    records = buildDnsPlan(subdomain, token, snapshot);
    dkimVerified = snapshot.dkimVerified;
    mailFromVerified = snapshot.mailFromVerified;
    txtVerified = snapshot.ownershipTxtVerified;
    mailFromDomain = records.find(
      (record) => record.purpose === 'mail_from_mx'
    )?.host ?? null;
    writeVerify = true;
  } else {
    records = [ownershipDnsRecord(subdomain, token)];
  }
  const stored = dnsRecordsForStorage(records, token, tokenHash);
  const admin = await adminFor(input.actorId);
  const inserted = parseClaimBody({
    ...asRecord(
      await callNewsletter(admin, 'newsletter_insert_domain', {
        p_ws_id: input.wsId,
        p_actor: input.actorId,
        p_subdomain: subdomain,
        p_token_hash: tokenHash,
        p_dns: stored,
        p_dkim_verified: dkimVerified,
        p_mail_from_verified: mailFromVerified,
        p_txt_verified: txtVerified,
        p_mail_from_domain: mailFromDomain,
        p_write_verify: writeVerify,
      })
    ),
    senders: [],
  });
  return { ...inserted, dnsRecords: records, token };
}

export async function addNewsletterSubscriber(input: {
  wsId: string;
  actorId: string;
  email: string;
}): Promise<{ created: false } | { created: true; token: string }> {
  assertUuid(input.wsId, 'not_found');
  assertUuid(input.actorId, 'store_failed');
  const email = normalizeSubscriberEmail(input.email);
  const token = createHighEntropyToken();
  const admin = await adminFor(input.actorId);
  const data = asRecord(
    await callNewsletter(admin, 'newsletter_insert_subscriber', {
      p_ws_id: input.wsId,
      p_email: email,
      p_token_hash: hashToken(token),
    })
  );
  if (data.created !== true) return { created: false };
  return { created: true, token };
}

export async function setNewsletterApproval(input: {
  wsId: string;
  actorId: string;
  action: 'approve' | 'suspend' | 'remove';
  localPart: string | null;
}): Promise<{ approval: ApprovalState; localPart: string | null; subdomain: string }> {
  assertUuid(input.wsId, 'not_found');
  assertUuid(input.actorId, 'store_failed');
  const localPart =
    input.localPart === null ? null : normalizeLocalPart(input.localPart);
  const admin = await adminFor(input.actorId);
  const data = asRecord(
    await callNewsletter(admin, 'newsletter_set_approval', {
      p_ws_id: input.wsId,
      p_actor: input.actorId,
      p_action: input.action,
      p_local_part: localPart,
    })
  );
  if (typeof data.subdomain !== 'string') {
    throw new NewsletterGateError('store_failed');
  }
  return {
    approval: parseApproval(data.approval),
    localPart: data.localPart === null ? null : localPart,
    subdomain: data.subdomain,
  };
}

export async function sendNewsletterStaffTest(input: {
  wsId: string;
  actorId: string;
  actorEmail: string;
  localPart: string;
  subject: string;
  text: string;
  mailer?: NewsletterMailer | null;
}): Promise<{ accepted: true }> {
  assertUuid(input.wsId, 'not_found');
  assertUuid(input.actorId, 'store_failed');
  const flagEnabled = await isNewsletterSendingEnabled(input.wsId);
  if (!flagEnabled) throw new NewsletterGateError('flag_disabled');
  const localPart = normalizeLocalPart(input.localPart);
  const message = normalizeStaffMessage(input.subject, input.text);
  const { claim } = await readNewsletterClaim(input.wsId);
  const sender =
    claim?.senders.find((item) => item.localPart === localPart) ?? null;
  const decision = decideStaffTestSend({
    acceptedToday: 0,
    actorEmail: input.actorEmail,
    domain: claim,
    flagEnabled,
    localPart,
    recipient: input.actorEmail,
    sender,
  });
  if (!decision.ok) throw new NewsletterGateError(decision.code);
  const recipient = assertSingleRecipient(input.actorEmail);
  const mailer =
    input.mailer === undefined ? getNewsletterMailer() : input.mailer;
  if (!mailer) throw new NewsletterGateError('mailer_unconfigured');
  const admin = await adminFor(input.actorId);
  const reserved = asRecord(
    await callNewsletter(admin, 'newsletter_reserve_staff_delivery', {
      p_ws_id: input.wsId,
      p_actor: input.actorId,
      p_actor_email: recipient,
      p_local_part: localPart,
      p_recipient: recipient,
      p_flag_enabled: flagEnabled,
    })
  );
  if (typeof reserved.id !== 'string') throw new NewsletterGateError('store_failed');
  try {
    await mailer.send({
      from: decision.from,
      subject: message.subject,
      text: message.text,
      to: recipient,
    });
  } catch {
    await callNewsletter(admin, 'newsletter_finish_staff_delivery', {
      p_ws_id: input.wsId,
      p_delivery_id: reserved.id,
      p_status: 'rejected',
    }).catch(() => undefined);
    throw new NewsletterGateError('mailer_failed');
  }
  // A crash after the mailer accepts leaves the row reserved, so it does not count.
  await callNewsletter(admin, 'newsletter_finish_staff_delivery', {
    p_ws_id: input.wsId,
    p_delivery_id: reserved.id,
    p_status: 'accepted',
  });
  return { accepted: true };
}

export async function unsubscribeNewsletter(token: string): Promise<void> {
  if (!UNSUBSCRIBE_TOKEN_PATTERN.test(token)) {
    throw new NewsletterGateError('invalid_token');
  }
  const admin = await adminFor(null);
  await callNewsletter(admin, 'newsletter_unsubscribe', {
    p_token_hash: hashToken(token),
  });
}
