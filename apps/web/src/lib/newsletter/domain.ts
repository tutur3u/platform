import { createHash, randomBytes } from 'node:crypto';

/**
 * Customer-subdomain gate for the workspace staff-test send.
 * This module has no framework imports so it can be checked without
 * installed packages. It never calls a provider or reads credentials.
 */

export const NEWSLETTER_DAILY_CAP = 10;

export const NEWSLETTER_GATE_CODES = [
  'flag_disabled',
  'domain_missing',
  'domain_unverified',
  'domain_not_approved',
  'domain_suspended',
  'sender_missing',
  'sender_not_approved',
  'sender_suspended',
  'local_part_denied',
  'invalid_local_part',
  'recipient_not_actor',
  'daily_cap',
  'not_one_recipient',
  'apex_domain',
  'public_suffix',
  'platform_domain',
  'localhost',
  'ip_address',
  'wildcard',
  'invalid_subdomain',
  'ses_records',
  'invalid_message',
  'invalid_email',
  'invalid_token',
  'invalid_request',
  'mailer_unconfigured',
  'mailer_failed',
  'conflict',
  'delivery_state',
  'store_failed',
  'not_found',
] as const;

export type NewsletterGateCode = (typeof NEWSLETTER_GATE_CODES)[number];

export class NewsletterGateError extends Error {
  readonly code: NewsletterGateCode;

  constructor(code: NewsletterGateCode) {
    super(code);
    this.name = 'NewsletterGateError';
    this.code = code;
  }
}

/** Multi-label public suffixes. A single trailing label is always a TLD. */
export const MULTI_PUBLIC_SUFFIXES = [
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'net.uk',
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'co.jp',
  'ne.jp',
  'or.jp',
  'ac.jp',
  'com.br',
  'com.mx',
  'com.ar',
  'com.tr',
  'com.sg',
  'com.hk',
  'com.tw',
  'com.cn',
  'com.vn',
  'net.vn',
  'org.vn',
  'edu.vn',
  'gov.vn',
  'co.nz',
  'co.za',
  'co.in',
  'co.kr',
  'com.co',
  'com.my',
  'com.ph',
  'com.pk',
  'com.ng',
  'co.id',
  'com.ua',
  'com.pl',
  'github.io',
  'blogspot.com',
  'vercel.app',
  'netlify.app',
  'pages.dev',
  'workers.dev',
  'cloudfront.net',
  'amazonaws.com',
  'herokuapp.com',
  'appspot.com',
  'firebaseapp.com',
  'web.app',
  'azurewebsites.net',
  'github.dev',
  'gitlab.io',
  'readthedocs.io',
  'notion.site',
  'wixsite.com',
  'square.site',
  'myshopify.com',
  'fly.dev',
] as const;

const LOCAL_PART = /^[a-z0-9._-]{1,32}$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DENIED_LOCAL_PARTS = new Set([
  'postmaster',
  'abuse',
  'admin',
  'root',
  'security',
  'hostmaster',
  'webmaster',
  'support',
]);
const SUBSCRIBER_EMAIL =
  /^[a-z0-9._%+-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
export const UNSUBSCRIBE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const DKIM_TOKEN = /^[A-Za-z0-9]{8,128}$/;

export type ApprovalState = 'pending' | 'approved' | 'suspended' | 'removed';

export type DomainGateSnapshot = {
  subdomain: string;
  approval: ApprovalState;
  dkimVerified: boolean;
  mailFromVerified: boolean;
  txtVerified: boolean;
};

export type SenderGateSnapshot = {
  localPart: string;
  approval: ApprovalState;
};

export type DnsPurpose = 'ownership' | 'dkim' | 'mail_from_spf' | 'mail_from_mx';

export type DnsRecord = {
  purpose: DnsPurpose;
  host: string;
  type: 'TXT' | 'CNAME' | 'MX';
  value: string | null;
};

export type SesIdentitySnapshot = {
  dkimTokens: readonly string[];
  dkimVerified: boolean;
  mailFromDomain: string;
  mailFromVerified: boolean;
  mxHost: string;
  mxPriority: number;
  spfValue: string;
  ownershipTxtVerified: boolean;
};

export type StaffSendDecision =
  | { ok: true; from: string }
  | { ok: false; code: NewsletterGateCode };

function fail(code: NewsletterGateCode): never {
  throw new NewsletterGateError(code);
}

function isIpAddress(name: string): boolean {
  if (/^\d+(?:\.\d+){3}$/.test(name)) return true;
  const bare =
    name.startsWith('[') && name.endsWith(']') ? name.slice(1, -1) : name;
  return bare.includes(':') && /^[0-9a-f:.]+$/i.test(bare);
}

function publicSuffix(name: string): { suffix: string; labels: number } {
  let best: { suffix: string; labels: number } | null = null;
  for (const suffix of MULTI_PUBLIC_SUFFIXES) {
    if (name !== suffix && !name.endsWith(`.${suffix}`)) continue;
    const labels = suffix.split('.').length;
    if (
      !best ||
      labels > best.labels ||
      (labels === best.labels && suffix.length > best.suffix.length)
    ) {
      best = { suffix, labels };
    }
  }
  if (best) return best;
  const last = name.split('.').at(-1) ?? name;
  return { suffix: last, labels: 1 };
}

export function normalizeSendingSubdomain(input: string): string {
  if (typeof input !== 'string') fail('invalid_subdomain');
  let name = input.trim().toLowerCase();
  if (name.endsWith('.') && !name.endsWith('..')) name = name.slice(0, -1);
  if (name.length === 0 || name.length > 253) fail('invalid_subdomain');
  if (name.includes('*')) fail('wildcard');
  if (isIpAddress(name)) fail('ip_address');
  if (!/^[a-z0-9.-]+$/.test(name) || name.includes('..')) {
    fail('invalid_subdomain');
  }
  const labels = name.split('.');
  if (
    labels.some(
      (label) => !LABEL.test(label) || label.startsWith('xn--')
    )
  ) {
    fail('invalid_subdomain');
  }
  if (name === 'localhost' || name.endsWith('.localhost')) fail('localhost');
  if (name === 'tuturuuu.com' || name.endsWith('.tuturuuu.com')) {
    fail('platform_domain');
  }
  const suffix = publicSuffix(name);
  if (name === suffix.suffix) fail('public_suffix');
  if (labels.length <= suffix.labels + 1) fail('apex_domain');
  return name;
}

export function normalizeLocalPart(input: string): string {
  if (typeof input !== 'string') fail('invalid_local_part');
  const localPart = input.trim().toLowerCase();
  if (!LOCAL_PART.test(localPart)) fail('invalid_local_part');
  if (DENIED_LOCAL_PARTS.has(localPart)) fail('local_part_denied');
  return localPart;
}

export function normalizeSubscriberEmail(input: string): string {
  if (typeof input !== 'string') fail('invalid_email');
  const email = input.trim().toLowerCase();
  if (
    email.length > 320 ||
    email.includes('..') ||
    !SUBSCRIBER_EMAIL.test(email)
  ) {
    fail('invalid_email');
  }
  return email;
}

export function normalizeStaffMessage(
  subject: string,
  text: string
): { subject: string; text: string } {
  if (typeof subject !== 'string' || typeof text !== 'string') {
    fail('invalid_message');
  }
  const cleanSubject = subject.replace(/[\r\n]+/g, ' ').trim();
  const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (
    cleanSubject.length === 0 ||
    cleanSubject.length > 120 ||
    cleanText.trim().length === 0 ||
    cleanText.length > 8000 ||
    cleanSubject.includes('\u0000') ||
    cleanText.includes('\u0000')
  ) {
    fail('invalid_message');
  }
  return { subject: cleanSubject, text: cleanText };
}

export function assertSingleRecipient(recipient: string): string {
  if (typeof recipient !== 'string') fail('not_one_recipient');
  const value = recipient.trim().toLowerCase();
  if (
    value.length === 0 ||
    value.includes(',') ||
    value.includes(';') ||
    /[\r\n]/.test(recipient) ||
    value.split('@').length !== 2
  ) {
    fail('not_one_recipient');
  }
  return value;
}

export function createHighEntropyToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function assertMailFromChild(subdomain: string, mailFromDomain: string): string {
  if (typeof mailFromDomain !== 'string') fail('ses_records');
  const name = mailFromDomain.trim().toLowerCase();
  const parent = `.${subdomain}`;
  if (!name.endsWith(parent) || name.length <= parent.length) {
    fail('ses_records');
  }
  const prefix = name.slice(0, -parent.length);
  if (!LABEL.test(prefix)) fail('ses_records');
  return name;
}

function assertSesSnapshot(
  subdomain: string,
  ses: SesIdentitySnapshot
): SesIdentitySnapshot {
  if (!ses || typeof ses !== 'object') fail('ses_records');
  const tokens = Array.isArray(ses.dkimTokens) ? ses.dkimTokens : null;
  if (!tokens || tokens.length !== 3 || new Set(tokens).size !== 3) {
    fail('ses_records');
  }
  if (tokens.some((token) => typeof token !== 'string' || !DKIM_TOKEN.test(token))) {
    fail('ses_records');
  }
  if (
    typeof ses.dkimVerified !== 'boolean' ||
    typeof ses.mailFromVerified !== 'boolean' ||
    typeof ses.ownershipTxtVerified !== 'boolean'
  ) {
    fail('ses_records');
  }
  const mailFromDomain = assertMailFromChild(subdomain, ses.mailFromDomain);
  if (typeof ses.mxHost !== 'string') fail('ses_records');
  const mxHost = ses.mxHost.trim().toLowerCase();
  if (
    !mxHost.endsWith('.amazonses.com') ||
    !/^[a-z0-9.-]+$/.test(mxHost) ||
    mxHost.split('.').some((label) => !LABEL.test(label))
  ) {
    fail('ses_records');
  }
  if (
    !Number.isInteger(ses.mxPriority) ||
    ses.mxPriority < 0 ||
    ses.mxPriority > 65535
  ) {
    fail('ses_records');
  }
  if (typeof ses.spfValue !== 'string') fail('ses_records');
  const spfValue = ses.spfValue.trim();
  if (
    spfValue.length === 0 ||
    spfValue.length > 255 ||
    !/^v=spf1(?:\s|$)/i.test(spfValue) ||
    !spfValue.toLowerCase().includes('amazonses.com') ||
    /[\r\n"\u0000]/.test(spfValue)
  ) {
    fail('ses_records');
  }
  return {
    dkimTokens: tokens,
    dkimVerified: ses.dkimVerified,
    mailFromDomain,
    mailFromVerified: ses.mailFromVerified,
    mxHost,
    mxPriority: ses.mxPriority,
    spfValue,
    ownershipTxtVerified: ses.ownershipTxtVerified,
  };
}

export function buildDnsPlan(
  subdomain: string,
  token: string,
  ses: SesIdentitySnapshot
): DnsRecord[] {
  const normalized = normalizeSendingSubdomain(subdomain);
  if (!UNSUBSCRIBE_TOKEN_PATTERN.test(token)) fail('ses_records');
  const snapshot = assertSesSnapshot(normalized, ses);
  const dkim = snapshot.dkimTokens.map((dkimToken) => ({
    purpose: 'dkim' as const,
    host: `${dkimToken}._domainkey.${normalized}`,
    type: 'CNAME' as const,
    value: `${dkimToken}.dkim.amazonses.com`,
  }));
  return [
    {
      purpose: 'ownership',
      host: `_tuturuuu-verify.${normalized}`,
      type: 'TXT',
      value: token,
    },
    ...dkim,
    {
      purpose: 'mail_from_spf',
      host: snapshot.mailFromDomain,
      type: 'TXT',
      value: snapshot.spfValue,
    },
    {
      purpose: 'mail_from_mx',
      host: snapshot.mailFromDomain,
      type: 'MX',
      value: `${snapshot.mxPriority} ${snapshot.mxHost}`,
    },
  ];
}

export function ownershipDnsRecord(subdomain: string, token: string): DnsRecord {
  const normalized = normalizeSendingSubdomain(subdomain);
  if (!UNSUBSCRIBE_TOKEN_PATTERN.test(token)) fail('ses_records');
  return {
    purpose: 'ownership',
    host: `_tuturuuu-verify.${normalized}`,
    type: 'TXT',
    value: token,
  };
}

export function dnsRecordsForStorage(
  records: readonly DnsRecord[],
  token: string,
  tokenHash: string
): DnsRecord[] {
  const stored = records.map((record) =>
    record.purpose === 'ownership' ? { ...record, value: null } : { ...record }
  );
  const encoded = JSON.stringify(stored);
  if (
    token.length > 0 &&
    (encoded.includes(token) || encoded.includes(tokenHash))
  ) {
    fail('ses_records');
  }
  return stored;
}

function domainGateCode(
  domain: DomainGateSnapshot | null
): NewsletterGateCode | null {
  if (!domain || domain.approval === 'removed') return 'domain_missing';
  if (domain.approval === 'suspended') return 'domain_suspended';
  if (domain.approval !== 'approved') return 'domain_not_approved';
  if (!domain.dkimVerified || !domain.mailFromVerified || !domain.txtVerified) {
    return 'domain_unverified';
  }
  return null;
}

function senderGateCode(
  sender: SenderGateSnapshot | null,
  localPart: string
): NewsletterGateCode | null {
  if (!sender || sender.approval === 'removed' || sender.localPart !== localPart) {
    return 'sender_missing';
  }
  if (sender.approval === 'suspended') return 'sender_suspended';
  if (sender.approval !== 'approved') return 'sender_not_approved';
  return null;
}

export function decideStaffTestSend(input: {
  flagEnabled: boolean;
  localPart: string;
  domain: DomainGateSnapshot | null;
  sender: SenderGateSnapshot | null;
  actorEmail: string;
  recipient: string;
  acceptedToday: number;
}): StaffSendDecision {
  if (!input.flagEnabled) return { ok: false, code: 'flag_disabled' };
  const localPart =
    typeof input.localPart === 'string' ? input.localPart.trim().toLowerCase() : '';
  if (!LOCAL_PART.test(localPart)) return { ok: false, code: 'invalid_local_part' };
  if (DENIED_LOCAL_PARTS.has(localPart)) {
    return { ok: false, code: 'local_part_denied' };
  }
  const domainCode = domainGateCode(input.domain);
  if (domainCode || !input.domain) return { ok: false, code: domainCode ?? 'domain_missing' };
  const senderCode = senderGateCode(input.sender, localPart);
  if (senderCode) return { ok: false, code: senderCode };
  if (typeof input.actorEmail !== 'string' || typeof input.recipient !== 'string') {
    return { ok: false, code: 'recipient_not_actor' };
  }
  if (
    input.recipient.includes(',') ||
    input.recipient.includes(';') ||
    /[\r\n]/.test(input.recipient)
  ) {
    return { ok: false, code: 'not_one_recipient' };
  }
  const actor = input.actorEmail.trim().toLowerCase();
  const recipient = input.recipient.trim().toLowerCase();
  if (!actor || actor !== recipient || recipient.split('@').length !== 2) {
    return { ok: false, code: 'recipient_not_actor' };
  }
  if (input.acceptedToday >= NEWSLETTER_DAILY_CAP) {
    return { ok: false, code: 'daily_cap' };
  }
  return { ok: true, from: `${localPart}@${input.domain.subdomain}` };
}

export function describeSendingGate(input: {
  flagEnabled: boolean;
  domain: DomainGateSnapshot | null;
  senders: readonly SenderGateSnapshot[];
}): { allowed: boolean; code: NewsletterGateCode | null } {
  if (!input.flagEnabled) return { allowed: false, code: 'flag_disabled' };
  const domainCode = domainGateCode(input.domain);
  if (domainCode) return { allowed: false, code: domainCode };
  if (input.senders.some((sender) => sender.approval === 'approved')) {
    return { allowed: true, code: null };
  }
  if (input.senders.some((sender) => sender.approval === 'suspended')) {
    return { allowed: false, code: 'sender_suspended' };
  }
  if (input.senders.some((sender) => sender.approval === 'pending')) {
    return { allowed: false, code: 'sender_not_approved' };
  }
  return { allowed: false, code: 'sender_missing' };
}
