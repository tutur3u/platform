import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  encryptReportReplyToken,
  reconstructReportReplyAddress,
  reportEmailContentDigest,
  reportReplyReceivingReady,
  reportReplyTokenDigest,
  reserveReportReplyIdentity,
  sendReportEmail,
} from './email-reply-identity';
import type {
  ReportEmailReplyIdentity,
  ReportEmailReplyLease,
  ReportEmailReplyScope,
} from './email-reply-types';

const key = randomBytes(32);
const scope: ReportEmailReplyScope = {
  ws_id: 'workspace',
  report_id: 'report',
  subject_user_id: 'subject',
  queue_id: 'queue',
  generation: 'generation',
  review_revision: 1,
  recipient_email: 'learner+report@example.com',
  delivery_kind: 'send',
  reply_domain: 'reply.example.com',
  content_sha256: reportEmailContentDigest('Report', '<p>Progress</p>'),
  key_version: 1,
};
const lease: ReportEmailReplyLease = {
  queueId: scope.queue_id,
  wsId: scope.ws_id,
  reportId: scope.report_id,
  subjectUserId: scope.subject_user_id,
  workerId: 'worker',
  lockedAt: '2026-10-09T12:00:00Z',
  recipient: scope.recipient_email,
  reviewRevision: 1,
  deliveryKind: 'send',
};
const options = {
  content: { subject: 'Report', html: '<p>Progress</p>' },
  recipients: { to: [lease.recipient] },
  metadata: { wsId: lease.wsId },
};
function identity(): ReportEmailReplyIdentity {
  return {
    ...scope,
    ...encryptReportReplyToken(scope, key),
    id: 'identity',
    outcome: 'reserved',
  };
}

afterEach(() => vi.unstubAllEnvs());

describe('opaque report reply identity', () => {
  it('uses 192 random bits, hashes lookup, and reconstructs the same retry address', () => {
    const stored = identity();
    const address = reconstructReportReplyAddress(stored, key);
    expect(address).toMatch(/^r-[0-9a-f]{48}@reply\.example\.com$/);
    expect(reconstructReportReplyAddress(stored, key)).toBe(address);
    const token = address.slice(2, 50);
    expect(stored.token_digest).toBe(`\\x${reportReplyTokenDigest(token)}`);
    expect(stored.token_ciphertext).not.toContain(token);
    const addresses = new Set(
      Array.from({ length: 512 }, () =>
        reconstructReportReplyAddress(identity(), key)
      )
    );
    expect(addresses.size).toBe(512);
  });

  it.each(Object.keys(scope) as (keyof ReportEmailReplyScope)[])(
    'authenticates immutable %s',
    (field) => {
      const stored = identity();
      const changed = {
        ...stored,
        [field]: typeof stored[field] === 'number' ? 2 : `${stored[field]}x`,
      };
      expect(() => reconstructReportReplyAddress(changed, key)).toThrow();
    }
  );

  it('rejects wrong keys, ciphertext tampering and mismatched lookup digest', () => {
    const stored = identity();
    expect(() =>
      reconstructReportReplyAddress(stored, randomBytes(32))
    ).toThrow();
    const modified = { ...stored, token_ciphertext: `\\x${'00'.repeat(76)}` };
    expect(() => reconstructReportReplyAddress(modified, key)).toThrow();
    expect(() =>
      reconstructReportReplyAddress(
        { ...stored, token_digest: `\\x${'00'.repeat(32)}` },
        key
      )
    ).toThrow();
  });

  it.each(['\\x00', `\\x${'zz'.repeat(76)}`])(
    'rejects malformed stored ciphertext before reconstructing an address',
    (token_ciphertext) => {
      expect(() =>
        reconstructReportReplyAddress({ ...identity(), token_ciphertext }, key)
      ).toThrow('Invalid report reply ciphertext');
    }
  );

  it.each([
    { data: null, error: null },
    { data: [], error: null },
    { data: 'identity', error: null },
    { data: {}, error: { code: 'lease_lost' } },
  ])('rejects malformed or failed reservation receipts %j', async (result) => {
    await expect(
      reserveReportReplyIdentity(
        vi.fn().mockResolvedValue(result),
        lease,
        { domain: scope.reply_domain, keyVersion: 1, key },
        scope.content_sha256
      )
    ).rejects.toThrow('Report reply identity reservation failed');
  });

  it.each([{ key_version: 2 }, { reply_domain: 'other.example.com' }])(
    'rejects retry identity key/domain rotation %j',
    async (changed) => {
      await expect(
        reserveReportReplyIdentity(
          vi.fn().mockResolvedValue({
            data: { ...identity(), ...changed },
            error: null,
          }),
          lease,
          { domain: scope.reply_domain, keyVersion: 1, key },
          scope.content_sha256
        )
      ).rejects.toThrow('Report reply identity key/domain changed');
    }
  );

  it.each([
    'A'.repeat(48),
    '0'.repeat(47),
    '0'.repeat(49),
    '../report',
    `a${'0'.repeat(47)}\n`,
  ])('rejects noncanonical token %s', (token) => {
    expect(() => reportReplyTokenDigest(token)).toThrow();
  });

  it('preserves plus-addressing and rejects domain/header injection', () => {
    expect(() =>
      encryptReportReplyToken(
        { ...scope, reply_domain: 'reply.example.com\r\nBcc: other' },
        key
      )
    ).toThrow();
    expect(() =>
      encryptReportReplyToken(
        { ...scope, recipient_email: 'learner@example.com\n' },
        key
      )
    ).toThrow();
    expect(identity().recipient_email).toBe('learner+report@example.com');
    expect(reportEmailContentDigest('ab', 'c')).not.toBe(
      reportEmailContentDigest('a', 'bc')
    );
  });

  it('uses returned immutable identity for concurrent same-generation retries', async () => {
    const stored = identity();
    const rpc = vi.fn().mockResolvedValue({ data: stored, error: null });
    const returned = await Promise.all(
      Array.from({ length: 8 }, () =>
        reserveReportReplyIdentity(
          rpc,
          lease,
          { domain: scope.reply_domain, keyVersion: 1, key },
          scope.content_sha256
        )
      )
    );
    expect(
      new Set(returned.map((row) => reconstructReportReplyAddress(row, key)))
        .size
    ).toBe(1);
    expect(
      new Set(rpc.mock.calls.map(([, args]) => args.p_generation)).size
    ).toBe(8);
    // SQL owns atomic uniqueness and fencing; this test proves discarded candidates aren't sent.
  });

  it.each([
    'ws_id',
    'report_id',
    'subject_user_id',
    'queue_id',
    'review_revision',
    'recipient_email',
    'delivery_kind',
    'content_sha256',
  ])('rejects returned %s substitution', async (field) => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...identity(), [field]: 'other' },
      error: null,
    });
    await expect(
      reserveReportReplyIdentity(
        rpc,
        lease,
        { domain: scope.reply_domain, keyVersion: 1, key },
        scope.content_sha256
      )
    ).rejects.toThrow();
  });

  it.each([
    { data: false, error: null },
    { data: true, error: {} },
    { data: null, error: null },
    { data: 'true', error: null },
  ])('requires explicit durable receiver readiness %j', async (result) => {
    expect(
      await reportReplyReceivingReady(vi.fn().mockResolvedValue(result))
    ).toBe(false);
  });
});

describe('report send foundation admission', () => {
  it('preserves disabled sending byte-for-byte without querying identity schema', async () => {
    vi.stubEnv('REPORT_EMAIL_REPLY_IDENTITY_ENABLED', 'false');
    const send = vi
      .fn()
      .mockResolvedValue({ success: true, messageId: 'provider-id' });
    const rpc = vi.fn();
    await sendReportEmail({ send } as never, options, rpc, lease);
    expect(send).toHaveBeenCalledExactlyOnceWith(options);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { data: false, error: null },
    { data: null, error: { code: '42883' } },
  ])(
    'never attaches a dead Reply-To when receiving is unproven %j',
    async (receipt) => {
      vi.stubEnv('REPORT_EMAIL_REPLY_IDENTITY_ENABLED', 'true');
      const send = vi.fn().mockResolvedValue({ success: true });
      const rpc = vi.fn().mockResolvedValue(receipt);
      await sendReportEmail({ send } as never, options, rpc, lease);
      expect(send).toHaveBeenCalledExactlyOnceWith(options);
      expect(rpc).toHaveBeenCalledExactlyOnceWith(
        'report_email_reply_receiving_ready',
        {}
      );
    }
  );

  function enabled(outcome: unknown, transitionError?: string) {
    vi.stubEnv('REPORT_EMAIL_REPLY_IDENTITY_ENABLED', 'true');
    vi.stubEnv('REPORT_EMAIL_REPLY_IDENTITY_KEY', key.toString('hex'));
    vi.stubEnv('REPORT_EMAIL_REPLY_IDENTITY_KEY_VERSION', '1');
    vi.stubEnv('REPORT_EMAIL_REPLY_DOMAIN', scope.reply_domain);
    const stored = identity();
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'report_email_reply_receiving_ready')
        return { data: true, error: null };
      if (name === 'reserve_report_email_reply_identity')
        return { data: stored, error: null };
      return {
        data:
          args.p_outcome !== transitionError
            ? { ...stored, outcome: args.p_outcome }
            : null,
        error: null,
      };
    });
    const send = vi.fn().mockResolvedValue(outcome);
    return { rpc, send, stored };
  }

  it('fences submitting before provider and preserves acceptance separately from application completion', async () => {
    const { rpc, send, stored } = enabled({
      success: true,
      messageId: 'provider-id',
    });
    const receipt = await sendReportEmail(
      { send } as never,
      options,
      rpc,
      lease
    );
    expect(rpc.mock.invocationCallOrder[2]).toBeLessThan(
      send.mock.invocationCallOrder[0]!
    );
    expect(send.mock.calls[0]?.[0].content.replyTo).toEqual([
      reconstructReportReplyAddress(stored, key),
    ]);
    expect(
      rpc.mock.calls.map(([, args]) => args.p_outcome).filter(Boolean)
    ).toEqual(['submitting', 'accepted']);
    await receipt.applicationSent?.();
    expect(rpc.mock.calls.at(-1)?.[1].p_outcome).toBe('application_sent');
  });

  it('does not invoke provider on lost lease/submitting fence', async () => {
    const { rpc, send } = enabled({ success: true }, 'submitting');
    await expect(
      sendReportEmail({ send } as never, options, rpc, lease)
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('preserves accepted outcome on tracking failure', async () => {
    const { rpc, send } = enabled(
      { success: true, messageId: 'accepted' },
      'accepted'
    );
    const receipt = await sendReportEmail(
      { send } as never,
      options,
      rpc,
      lease
    );
    expect(receipt).toMatchObject({
      sendResult: { success: true, messageId: 'accepted' },
      trackingError: true,
    });
  });

  it.each([undefined, 'invalid'])(
    'does not submit without a valid identity key',
    async (encodedKey) => {
      const { rpc, send } = enabled({ success: true });
      if (encodedKey === undefined)
        vi.stubEnv('REPORT_EMAIL_REPLY_IDENTITY_KEY', undefined);
      else vi.stubEnv('REPORT_EMAIL_REPLY_IDENTITY_KEY', encodedKey);
      await expect(
        sendReportEmail({ send } as never, options, rpc, lease)
      ).rejects.toThrow('Report reply identity key is unavailable');
      expect(send).not.toHaveBeenCalled();
      expect(rpc.mock.calls.map(([name]) => name)).toEqual([
        'report_email_reply_receiving_ready',
      ]);
    }
  );

  it.each(['rejected', 'outcome_unknown'])(
    'keeps failed %s persistence unsafe to retry',
    async (outcome) => {
      const { rpc, send } = enabled(
        {
          success: false,
          error: 'Rejected',
          ...(outcome === 'outcome_unknown'
            ? { deliveryOutcome: 'unknown' }
            : {}),
        },
        outcome
      );
      const receipt = await sendReportEmail(
        { send } as never,
        options,
        rpc,
        lease
      );
      expect(receipt.sendResult).toMatchObject({
        success: false,
        deliveryOutcome: 'unknown',
      });
      expect(receipt.applicationSent).toBeUndefined();
      expect(send).toHaveBeenCalledOnce();
      expect(
        rpc.mock.calls.map(([, args]) => args.p_outcome).filter(Boolean)
      ).toEqual(['submitting', outcome]);
    }
  );

  it('keeps thrown submission unknown even if its durable receipt fails', async () => {
    const { rpc, send } = enabled({ success: false }, 'outcome_unknown');
    send.mockRejectedValue(new Error('Transport interrupted'));
    const receipt = await sendReportEmail(
      { send } as never,
      options,
      rpc,
      lease
    );
    expect(receipt.sendResult).toEqual({
      success: false,
      deliveryOutcome: 'unknown',
    });
    expect(send).toHaveBeenCalledOnce();
    expect(rpc.mock.calls.at(-1)?.[1].p_outcome).toBe('outcome_unknown');
  });

  it.each(['provider-unknown', 'throw'])(
    'blocks automatic resend after %s',
    async (kind) => {
      const { rpc, send } = enabled({
        success: false,
        deliveryOutcome: 'unknown',
      });
      if (kind === 'throw')
        send.mockRejectedValue(new Error('Transport interrupted'));
      const receipt = await sendReportEmail(
        { send } as never,
        options,
        rpc,
        lease
      );
      expect(receipt.sendResult.deliveryOutcome).toBe('unknown');
      expect(rpc.mock.calls.at(-1)?.[1].p_outcome).toBe('outcome_unknown');
    }
  );
});
