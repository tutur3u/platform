import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { reportReplyTokenDigest } from './email-reply-identity';
import {
  admitReportEmailReply,
  reportReplyParsedContentDigest,
} from './email-reply-ingress';
import type {
  ReportReplyAppend,
  ReportReplyAppendReceipt,
  ReportReplyIngressEvent,
  ReportReplySenderVerification,
} from './email-reply-ingress-types';
import type { ReportEmailReplyIdentity } from './email-reply-types';

const id = '00000000-0000-4000-8000-000000000001';
const wsId = '00000000-0000-4000-8000-000000000002';
const reportId = '00000000-0000-4000-8000-000000000003';
const subjectUserId = '00000000-0000-4000-8000-000000000004';
const messageId = '00000000-0000-4000-8000-000000000005';
const receiptId = '00000000-0000-4000-8000-000000000006';
const token = 'a'.repeat(48);
const options = { enabled: true, domain: 'reply.example.com' };

function fixture() {
  const raw = Buffer.from('synthetic raw MIME; no real sender or network');
  const event: ReportReplyIngressEvent = {
    provider: 'ses',
    accountId: 'receiver-account',
    eventId: 'delivery-1',
    envelopeRecipient: `r-${token}@reply.example.com`,
    raw,
    rawSha256: createHash('sha256').update(raw).digest('hex'),
    from: ['parent@example.com'],
    internetMessageId: '<reply-1@example.com>',
    inReplyTo: '<outbound@example.com>',
    references: [],
    bodyText: 'Thank you',
  };
  const identity: ReportEmailReplyIdentity = {
    id,
    generation: id,
    ws_id: wsId,
    report_id: reportId,
    subject_user_id: subjectUserId,
    queue_id: id,
    review_revision: 1,
    recipient_email: 'parent@example.com',
    delivery_kind: 'send',
    reply_domain: options.domain,
    content_sha256: 'b'.repeat(64),
    key_version: 1,
    token_digest: `\\x${reportReplyTokenDigest(token)}`,
    token_ciphertext: 'opaque-encrypted-token',
    outcome: 'accepted',
  };
  const proof = {
    provider: event.provider,
    accountId: event.accountId,
    eventId: event.eventId,
    envelopeRecipient: event.envelopeRecipient,
    rawSha256: event.rawSha256,
    signatureVerified: true as const,
    verificationBypassed: false as const,
    spam: 'pass' as const,
    malware: 'pass' as const,
  };
  const sender = {
    rawSha256: event.rawSha256,
    contentSha256: reportReplyParsedContentDigest(event),
    sender: 'parent@example.com',
    alignedDomain: 'example.com',
    method: 'raw-dkim' as const,
    fullBodyVerified: true as const,
    signatureTimeValid: true as const,
  };
  const deps = {
    verifyTransport: vi.fn(async () => proof),
    lookupIdentity: vi.fn(
      async () => identity as ReportEmailReplyIdentity | null
    ),
    validateCurrentScope: vi.fn(async () => ({
      identityId: id,
      wsId,
      reportId,
      subjectUserId,
      accessible: true,
    })),
    verifySender: vi.fn(
      async (): Promise<ReportReplySenderVerification> => ({
        status: 'verified',
        proof: sender,
      })
    ),
    resolveAncestors: vi.fn(
      async (_ids: readonly string[]) => [id] as readonly string[]
    ),
    append: vi.fn(
      async (
        _message: Readonly<ReportReplyAppend>
      ): Promise<ReportReplyAppendReceipt> => ({
        status: 'accepted',
        identityId: id,
        rawSha256: event.rawSha256,
        messageId,
        receiptId,
      })
    ),
  };
  return { event, identity, proof, sender, deps };
}

describe('disconnected report reply admission', () => {
  it('defaults off without invoking any dependency', async () => {
    const f = fixture();
    expect(await admitReportEmailReply(f.event, f.deps)).toEqual({
      status: 'disabled',
    });
    for (const dependency of Object.values(f.deps))
      expect(dependency).not.toHaveBeenCalled();
  });

  it('accepts only after separate bound proofs, scope and immutable append', async () => {
    const f = fixture();
    expect(await admitReportEmailReply(f.event, f.deps, options)).toEqual({
      status: 'accepted',
      messageId,
      receiptId,
    });
    const append = f.deps.append.mock.calls[0]![0];
    expect(Object.isFrozen(append)).toBe(true);
    expect(Object.isFrozen(append.references)).toBe(true);
    expect(append).toMatchObject({
      identityId: id,
      wsId,
      reportId,
      subjectUserId,
      deliveryKind: 'send',
    });
    expect(JSON.stringify(append)).not.toContain(token);
    expect(f.deps.lookupIdentity).toHaveBeenCalledWith(
      reportReplyTokenDigest(token)
    );
    expect(f.deps.verifySender).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['domain mismatch', { envelopeRecipient: `r-${token}@other.example.com` }],
    [
      'uppercase token',
      { envelopeRecipient: `r-${token.toUpperCase()}@reply.example.com` },
    ],
    [
      'header injection',
      { envelopeRecipient: `r-${token}@reply.example.com\r\nX: forged` },
    ],
    ['raw mismatch', { rawSha256: '0'.repeat(64) }],
    ['empty bytes', { raw: new Uint8Array() }],
    [
      'too many references',
      { references: Array(101).fill('<one@example.com>') },
    ],
    ['invalid ancestor', { inReplyTo: '<one@example.com>\r\nX: forged' }],
    ['oversized body', { bodyText: 'x'.repeat(100001) }],
    ['event injection', { eventId: 'delivery\nforged' }],
  ] as const)('rejects %s before transport or lookup', async (_name, patch) => {
    const f = fixture();
    Object.assign(f.event, patch);
    expect(await admitReportEmailReply(f.event, f.deps, options)).toEqual({
      status: 'rejected',
      reason: 'invalid_event',
    });
    expect(f.deps.verifyTransport).not.toHaveBeenCalled();
    expect(f.deps.lookupIdentity).not.toHaveBeenCalled();
  });

  it.each([
    ['unsigned', { signatureVerified: false }],
    ['bypass', { verificationBypassed: true }],
    ['different bytes', { rawSha256: '0'.repeat(64) }],
    ['different envelope', { envelopeRecipient: 'other@example.com' }],
    ['different event', { eventId: 'other' }],
    ['different provider', { provider: 'cloudflare' }],
    ['different account', { accountId: 'other' }],
    ['spam', { spam: 'fail' }],
    ['malware unknown', { malware: 'unknown' }],
  ])('does not trust transport %s', async (_name, patch) => {
    const f = fixture();
    f.deps.verifyTransport.mockResolvedValue(
      Object.assign({}, f.proof, patch) as typeof f.proof
    );
    expect(await admitReportEmailReply(f.event, f.deps, options)).toEqual({
      status: 'rejected',
      reason: 'untrusted_transport',
    });
    expect(f.deps.lookupIdentity).not.toHaveBeenCalled();
    expect(f.deps.verifySender).not.toHaveBeenCalled();
  });

  it('a boolean transport success cannot replace bound proof', async () => {
    const f = fixture();
    f.deps.verifyTransport.mockResolvedValue(true as unknown as typeof f.proof);
    expect(await admitReportEmailReply(f.event, f.deps, options)).toMatchObject(
      { status: 'rejected' }
    );
  });

  it.each(['reserved', 'rejected'])(
    'never admits %s identities',
    async (outcome) => {
      const f = fixture();
      f.identity.outcome = outcome as ReportEmailReplyIdentity['outcome'];
      expect(await admitReportEmailReply(f.event, f.deps, options)).toEqual({
        status: 'rejected',
        reason: 'identity_unavailable',
      });
      expect(f.deps.append).not.toHaveBeenCalled();
    }
  );

  it.each(['submitting', 'outcome_unknown', 'application_sent'])(
    'retains replies for %s without changing send outcome',
    async (outcome) => {
      const f = fixture();
      f.identity.outcome = outcome as ReportEmailReplyIdentity['outcome'];
      expect(
        await admitReportEmailReply(f.event, f.deps, options)
      ).toMatchObject({ status: 'accepted' });
      expect(f.identity.outcome).toBe(outcome);
    }
  );

  it.each(['identityId', 'wsId', 'reportId', 'subjectUserId'])(
    'denies mismatched current scope %s',
    async (field) => {
      const f = fixture();
      f.deps.validateCurrentScope.mockResolvedValue({
        identityId: id,
        wsId,
        reportId,
        subjectUserId,
        accessible: true,
        [field]: messageId,
      });
      expect(await admitReportEmailReply(f.event, f.deps, options)).toEqual({
        status: 'rejected',
        reason: 'scope_denied',
      });
      expect(f.deps.append).not.toHaveBeenCalled();
    }
  );

  it.each(
    [
      [],
      ['parent@example.com', 'other@example.com'],
      ['parent+other@example.com'],
      ['parent@other.example.com'],
      ['parent@example.com\n'],
    ].map((from) => ({ from }))
  )('quarantines nonexact single From $from', async ({ from }) => {
    const f = fixture();
    f.event.from = from;
    expect(await admitReportEmailReply(f.event, f.deps, options)).toEqual({
      status: 'quarantined',
      reason: 'sender_unverified',
    });
    expect(f.deps.append).not.toHaveBeenCalled();
  });

  it.each([
    ['header claim', { method: 'authentication-results' }],
    ['transport claim', { method: 'worker-hmac' }],
    ['wrong raw', { rawSha256: '0'.repeat(64) }],
    ['wrong content', { contentSha256: '0'.repeat(64) }],
    ['wrong sender', { sender: 'other@example.com' }],
    ['unaligned', { alignedDomain: 'other.example.com' }],
    ['partial body', { fullBodyVerified: false }],
    ['invalid time', { signatureTimeValid: false }],
  ])('quarantines sender proof %s', async (_name, patch) => {
    const f = fixture();
    f.deps.verifySender.mockResolvedValue({
      status: 'verified',
      proof: Object.assign({}, f.sender, patch) as typeof f.sender,
    });
    expect(await admitReportEmailReply(f.event, f.deps, options)).toEqual({
      status: 'quarantined',
      reason: 'sender_unverified',
    });
    expect(f.deps.append).not.toHaveBeenCalled();
  });

  it('does not trust a valid transport as sender proof', async () => {
    const f = fixture();
    f.deps.verifySender.mockResolvedValue({
      status: 'verified',
      proof: f.proof as unknown as typeof f.sender,
    });
    expect(await admitReportEmailReply(f.event, f.deps, options)).toMatchObject(
      { status: 'quarantined' }
    );
  });

  it('quarantines any known ancestor from another identity', async () => {
    const f = fixture();
    f.deps.resolveAncestors.mockResolvedValue([id, messageId]);
    expect(await admitReportEmailReply(f.event, f.deps, options)).toEqual({
      status: 'quarantined',
      reason: 'ancestor_conflict',
    });
    expect(f.deps.append).not.toHaveBeenCalled();
  });

  it('keeps temporary sender verification unknown without append or retry', async () => {
    const f = fixture();
    f.deps.verifySender.mockResolvedValue({ status: 'unknown' });
    expect(await admitReportEmailReply(f.event, f.deps, options)).toEqual({
      status: 'unknown',
    });
    expect(f.deps.verifySender).toHaveBeenCalledTimes(1);
    expect(f.deps.resolveAncestors).not.toHaveBeenCalled();
    expect(f.deps.append).not.toHaveBeenCalled();
  });

  it('quarantines definitive sender verification rejection', async () => {
    const f = fixture();
    f.deps.verifySender.mockResolvedValue({ status: 'rejected' });
    expect(await admitReportEmailReply(f.event, f.deps, options)).toEqual({
      status: 'quarantined',
      reason: 'sender_unverified',
    });
    expect(f.deps.append).not.toHaveBeenCalled();
  });

  it('holds validated sender primitives when proof changes during ancestor lookup', async () => {
    const f = fixture();
    f.deps.resolveAncestors.mockImplementation(async () => {
      f.sender.sender = 'changed@example.com';
      f.sender.rawSha256 = '0'.repeat(64);
      return [id];
    });
    expect(await admitReportEmailReply(f.event, f.deps, options)).toMatchObject(
      { status: 'accepted' }
    );
    expect(f.deps.append.mock.calls[0]![0]).toMatchObject({
      sender: 'parent@example.com',
      rawSha256: f.event.rawSha256,
    });
  });

  it('allows unknown headers and preserves separate test kind', async () => {
    const f = fixture();
    f.identity.delivery_kind = 'test';
    f.deps.resolveAncestors.mockResolvedValue([]);
    expect(await admitReportEmailReply(f.event, f.deps, options)).toMatchObject(
      { status: 'accepted' }
    );
    expect(f.deps.append.mock.calls[0]![0].deliveryKind).toBe('test');
  });

  it.each(['duplicate', 'conflict', 'unknown'])(
    'preserves definitive append %s without retry',
    async (status) => {
      const f = fixture();
      f.deps.append.mockResolvedValue(
        status === 'duplicate'
          ? {
              status,
              identityId: id,
              rawSha256: f.event.rawSha256,
              messageId,
              receiptId,
            }
          : ({ status } as ReportReplyAppendReceipt)
      );
      expect(
        (await admitReportEmailReply(f.event, f.deps, options)).status
      ).toBe(status === 'conflict' ? 'quarantined' : status);
      expect(f.deps.append).toHaveBeenCalledTimes(1);
    }
  );

  it('treats a malformed append acknowledgement as unknown', async () => {
    const f = fixture();
    f.deps.append.mockResolvedValue({
      status: 'accepted',
      identityId: reportId,
      rawSha256: f.event.rawSha256,
      messageId,
      receiptId,
    });
    expect(await admitReportEmailReply(f.event, f.deps, options)).toEqual({
      status: 'unknown',
    });
    expect(f.deps.append).toHaveBeenCalledTimes(1);
  });

  it.each([
    'verifyTransport',
    'lookupIdentity',
    'validateCurrentScope',
    'verifySender',
    'resolveAncestors',
    'append',
  ] as const)(
    'safe unknown on %s exception; no token/error disclosure or retry',
    async (method) => {
      const f = fixture();
      f.deps[method].mockRejectedValue(
        new Error(`${token}: private MIME contents`)
      );
      const result = await admitReportEmailReply(f.event, f.deps, options);
      expect(result).toEqual({ status: 'unknown' });
      expect(JSON.stringify(result)).not.toContain(token);
      expect(f.deps[method]).toHaveBeenCalledTimes(1);
    }
  );

  it('snapshots caller content across awaiting verification', async () => {
    const f = fixture();
    f.deps.verifyTransport.mockImplementation(async () => {
      f.event.bodyText = 'changed';
      f.event.references.push('<other@example.com>');
      f.event.raw[0] = 1;
      return f.proof;
    });
    expect(await admitReportEmailReply(f.event, f.deps, options)).toMatchObject(
      { status: 'accepted' }
    );
    expect(f.deps.append.mock.calls[0]![0]).toMatchObject({
      bodyText: 'Thank you',
      references: [],
    });
  });
});
