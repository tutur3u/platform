import { createHash } from 'node:crypto';
import { reportReplyTokenDigest } from './email-reply-identity';
import type {
  ReportReplyIngressDependencies,
  ReportReplyIngressEvent,
  ReportReplyIngressResult,
  ReportReplyTransportProof,
} from './email-reply-ingress-types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX = /^[0-9a-f]{64}$/;
const ADDRESS = /^[^\s@<>]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/;
const MESSAGE_ID = /^<[^\s<>]{1,998}>$/;
const OUTCOMES = new Set([
  'submitting',
  'accepted',
  'application_sent',
  'outcome_unknown',
]);

function normalizedAddress(value: string) {
  return value.trim().toLowerCase();
}

function validOpaqueId(value: string) {
  return (
    value.length > 0 &&
    value.length <= 1024 &&
    ![...value].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    )
  );
}

/** Adapter must derive this exact tuple by independently parsing the verified raw MIME. */
export function reportReplyParsedContentDigest(event: ReportReplyIngressEvent) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        event.from,
        event.internetMessageId,
        event.inReplyTo,
        event.references,
        event.bodyText,
      ])
    )
    .digest('hex');
}

/** No adapter, route or activation is installed by this disconnected policy. */
export async function admitReportEmailReply(
  event: ReportReplyIngressEvent,
  dependencies: ReportReplyIngressDependencies,
  options: { enabled?: boolean; domain?: string } = {}
): Promise<ReportReplyIngressResult> {
  if (options.enabled !== true) return { status: 'disabled' };
  try {
    // Snapshot mutable caller input before any async dependency is invoked.
    const input = {
      ...event,
      raw: new Uint8Array(event.raw),
      from: [...event.from],
      references: [...event.references],
    };
    Object.freeze(input.from);
    Object.freeze(input.references);
    Object.freeze(input);
    const domain = options.domain;
    const recipient = input.envelopeRecipient;
    const tokenMatch = /^r-([0-9a-f]{48})@([^@]+)$/.exec(recipient);
    if (
      !domain ||
      !ADDRESS.test(`r@${domain}`) ||
      !tokenMatch ||
      tokenMatch[2] !== domain ||
      !['ses', 'cloudflare'].includes(input.provider) ||
      !validOpaqueId(input.accountId) ||
      !validOpaqueId(input.eventId) ||
      input.raw.byteLength === 0 ||
      input.raw.byteLength > 25 * 1024 * 1024 ||
      !HEX.test(input.rawSha256) ||
      createHash('sha256').update(input.raw).digest('hex') !==
        input.rawSha256 ||
      input.bodyText.length > 100000 ||
      input.references.length > 100 ||
      [input.internetMessageId, input.inReplyTo, ...input.references].some(
        (id) => id !== null && !MESSAGE_ID.test(id)
      )
    )
      return { status: 'rejected', reason: 'invalid_event' };

    const transport = (await dependencies.verifyTransport(
      input
    )) as ReportReplyTransportProof | null;
    if (
      transport?.signatureVerified !== true ||
      transport.verificationBypassed !== false ||
      transport.spam !== 'pass' ||
      transport.malware !== 'pass' ||
      createHash('sha256').update(input.raw).digest('hex') !==
        input.rawSha256 ||
      [
        'provider',
        'accountId',
        'eventId',
        'envelopeRecipient',
        'rawSha256',
      ].some(
        (key) =>
          transport[key as keyof ReportReplyTransportProof] !==
          input[key as keyof ReportReplyIngressEvent]
      )
    )
      return { status: 'rejected', reason: 'untrusted_transport' };

    const tokenDigest = reportReplyTokenDigest(tokenMatch[1]!);
    const resolved = await dependencies.lookupIdentity(tokenDigest);
    if (!resolved)
      return { status: 'rejected', reason: 'identity_unavailable' };
    const identity = Object.freeze({ ...resolved });
    if (
      identity.reply_domain !== domain ||
      identity.token_digest.replace(/^\\x/, '') !== tokenDigest ||
      !OUTCOMES.has(identity.outcome) ||
      identity.id !== identity.generation ||
      ![
        identity.id,
        identity.ws_id,
        identity.report_id,
        identity.subject_user_id,
      ].every((id) => UUID.test(id)) ||
      !['send', 'test'].includes(identity.delivery_kind) ||
      !ADDRESS.test(identity.recipient_email) ||
      normalizedAddress(identity.recipient_email) !== identity.recipient_email
    )
      return { status: 'rejected', reason: 'identity_unavailable' };

    const scope = await dependencies.validateCurrentScope(identity);
    if (
      scope?.accessible !== true ||
      scope.identityId !== identity.id ||
      scope.wsId !== identity.ws_id ||
      scope.reportId !== identity.report_id ||
      scope.subjectUserId !== identity.subject_user_id
    )
      return { status: 'rejected', reason: 'scope_denied' };

    if (
      input.from.length !== 1 ||
      !validOpaqueId(input.from[0]!) ||
      !ADDRESS.test(normalizedAddress(input.from[0]!)) ||
      normalizedAddress(input.from[0]!) !== identity.recipient_email
    )
      return { status: 'quarantined', reason: 'sender_unverified' };
    const verification = await dependencies.verifySender(input);
    if (verification?.status === 'rejected')
      return { status: 'quarantined', reason: 'sender_unverified' };
    if (verification?.status !== 'verified' || !verification.proof)
      return { status: 'unknown' };
    // Hold verified primitive values across ancestor lookup; adapters may reuse
    // or mutate their own proof object while another dependency is awaited.
    const proof = verification.proof;
    const sender = Object.freeze({
      rawSha256: proof.rawSha256,
      contentSha256: proof.contentSha256,
      sender: proof.sender,
      alignedDomain: proof.alignedDomain,
      method: proof.method,
      fullBodyVerified: proof.fullBodyVerified,
      signatureTimeValid: proof.signatureTimeValid,
    });
    const contentSha256 = reportReplyParsedContentDigest(input);
    if (
      sender?.method !== 'raw-dkim' ||
      sender.rawSha256 !== input.rawSha256 ||
      sender.contentSha256 !== contentSha256 ||
      sender.sender !== identity.recipient_email ||
      sender.alignedDomain !== identity.recipient_email.split('@')[1] ||
      sender.fullBodyVerified !== true ||
      sender.signatureTimeValid !== true ||
      createHash('sha256').update(input.raw).digest('hex') !== input.rawSha256
    )
      return { status: 'quarantined', reason: 'sender_unverified' };

    const ancestorIds = [
      ...new Set(
        [input.inReplyTo, ...input.references].filter(
          (id): id is string => id !== null
        )
      ),
    ];
    const ancestors = await dependencies.resolveAncestors(
      Object.freeze(ancestorIds)
    );
    if (!Array.isArray(ancestors)) return { status: 'unknown' };
    if (ancestors.some((id) => id !== identity.id))
      return { status: 'quarantined', reason: 'ancestor_conflict' };

    // Domain/token are not forwarded to storage or returned in public results.
    const receipt = await dependencies.append(
      Object.freeze({
        identityId: identity.id,
        wsId: identity.ws_id,
        reportId: identity.report_id,
        subjectUserId: identity.subject_user_id,
        deliveryKind: identity.delivery_kind,
        provider: input.provider,
        accountId: input.accountId,
        eventId: input.eventId,
        envelopeRecipientDigest: createHash('sha256')
          .update(recipient)
          .digest('hex'),
        rawSha256: input.rawSha256,
        contentSha256,
        sender: sender.sender,
        internetMessageId: input.internetMessageId,
        inReplyTo: input.inReplyTo,
        references: Object.freeze([...input.references]),
        bodyText: input.bodyText,
      })
    );
    if (receipt?.status === 'conflict')
      return { status: 'quarantined', reason: 'content_conflict' };
    if (
      (receipt?.status === 'accepted' || receipt?.status === 'duplicate') &&
      receipt.identityId === identity.id &&
      receipt.rawSha256 === input.rawSha256 &&
      UUID.test(receipt.messageId) &&
      UUID.test(receipt.receiptId)
    )
      return {
        status: receipt.status,
        messageId: receipt.messageId,
        receiptId: receipt.receiptId,
      };
    return { status: 'unknown' };
  } catch {
    // No error text from adapters: it may contain raw Reply-To tokens or MIME.
    return { status: 'unknown' };
  }
}
