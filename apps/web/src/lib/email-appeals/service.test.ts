import { describe, expect, it, vi } from 'vitest';
import { AppealError, hashAppealToken, issueAppealToken } from './domain';
import { type AppealStore, confirmAppeal, requestAppeal } from './service';

const wsId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const key = 'isolated-test-signing-key-32-bytes-minimum';
const now = 1_800_000_000_000;
const input = {
  wsId,
  actorId,
  email: 'member@example.com',
  reason: 'Mailbox repaired and receiving mail',
};

function fixture(reason = 'ses_hard_bounce') {
  const calls: {
    hash: string | null;
    delivery: string | null;
    consumed: boolean;
  } = {
    hash: null,
    delivery: null,
    consumed: false,
  };
  const store: AppealStore = {
    request: vi.fn(async (value) => {
      calls.hash = value.tokenHash;
      return {
        id,
        email: value.email,
        reason,
        status: 'pending',
        expires_at: new Date(now + 86400000).toISOString(),
      };
    }),
    claimDelivery: vi.fn(async () => {
      calls.delivery = 'dispatching';
      return { status: 'dispatching' };
    }),
    markDelivery: vi.fn(async (_id, outcome) => {
      calls.delivery = outcome;
    }),
    confirm: vi.fn(async (hash) => {
      if (hash !== calls.hash || calls.delivery !== 'sent' || calls.consumed)
        return { status: 'invalid' };
      calls.consumed = true;
      return { status: 'confirmed' };
    }),
  };
  const send = vi.fn(
    async (_value: { email: string; url: string }) => undefined
  );
  const dependencies = {
    store,
    key,
    now,
    origin: 'https://tuturuuu.com',
    mailer: {
      reviewReceipt: 'test-only-reviewed-adapter',
      complaintRecovery: 'disabled' as const,
      sendConfirmation: send,
    },
    checkMx: vi.fn(async () => true),
  };
  return { calls, store, send, dependencies };
}

describe('appeal orchestration', () => {
  it('sends one fragment challenge, stores only its hash, and consumes it once', async () => {
    const f = fixture();
    expect(await requestAppeal(input, f.dependencies)).toEqual({
      status: 'sent',
    });
    const sent = f.send.mock.calls[0]?.[0];
    expect(sent?.email).toBe(input.email);
    const url = new URL(sent?.url ?? 'https://invalid.test');
    expect(url.pathname).toBe('/en/email-appeals');
    expect(url.search).toBe('');
    const token = new URLSearchParams(url.hash.slice(1)).get('token') ?? '';
    expect(token).not.toBe('');
    expect(f.calls.hash).toBe(hashAppealToken(token));
    expect(f.calls.delivery).toBe('sent');
    const confirmation = {
      store: f.store,
      key,
      now,
      isEnabled: vi.fn(async () => true),
    };
    expect(await confirmAppeal(token, confirmation)).toEqual({
      status: 'confirmed',
    });
    await expect(confirmAppeal(token, confirmation)).rejects.toMatchObject({
      code: 'invalid_token',
      message: 'invalid_token',
    });
  });
  it('never sends an admin-initiated appeal to a complainant', async () => {
    const f = fixture('ses_complaint');
    expect(await requestAppeal(input, f.dependencies)).toEqual({
      status: 'waiting_recipient',
    });
    expect(f.send).not.toHaveBeenCalled();
    expect(f.calls.delivery).toBe('waiting_recipient');
    expect(f.dependencies.checkMx).not.toHaveBeenCalled();
  });
  it('records unavailable transport without pretending a send failed', async () => {
    const f = fixture();
    expect(
      await requestAppeal(input, { ...f.dependencies, mailer: null })
    ).toEqual({ status: 'unavailable' });
    expect(f.calls.delivery).toBe('unavailable');
    expect(f.send).not.toHaveBeenCalled();
  });
  it('audits an unconfigured signing key and never sends an unsigned token', async () => {
    const f = fixture();
    expect(await requestAppeal(input, { ...f.dependencies, key: '' })).toEqual({
      status: 'unavailable',
    });
    expect(f.calls.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(f.calls.delivery).toBe('unavailable');
    expect(f.send).not.toHaveBeenCalled();
  });
  it('refuses a failed fresh hard-bounce MX check before contacting provider', async () => {
    const f = fixture();
    f.dependencies.checkMx.mockResolvedValue(false);
    await expect(requestAppeal(input, f.dependencies)).rejects.toMatchObject({
      code: 'deliverability_failed',
      message: 'deliverability_failed',
    });
    expect(f.calls.delivery).toBe('failed');
    expect(f.send).not.toHaveBeenCalled();
  });
  it('records a provider unknown outcome once and never retries it', async () => {
    const f = fixture();
    f.send.mockRejectedValue(new Error('provider response lost'));
    expect(await requestAppeal(input, f.dependencies)).toEqual({
      status: 'unknown',
    });
    expect(f.calls.delivery).toBe('unknown');
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it('refuses dispatch when a complaint reblocks the address during MX lookup', async () => {
    const f = fixture();
    f.dependencies.checkMx.mockImplementation(async () => {
      f.store.claimDelivery = vi.fn(async () => ({ status: 'reblocked' }));
      return true;
    });
    expect(await requestAppeal(input, f.dependencies)).toEqual({
      status: 'unavailable',
    });
    expect(f.store.claimDelivery).toHaveBeenCalledWith(id);
    expect(f.send).not.toHaveBeenCalled();
  });
  it.each(['rate_limited', 'cooldown', 'forbidden'] as const)(
    'stops before DNS or send on %s',
    async (code) => {
      const f = fixture();
      f.store.request = vi.fn(async () => {
        throw new AppealError(code);
      });
      await expect(requestAppeal(input, f.dependencies)).rejects.toMatchObject({
        code,
        message: code,
      });
      expect(f.send).not.toHaveBeenCalled();
      expect(f.dependencies.checkMx).not.toHaveBeenCalled();
    }
  );
  it('refuses confirmation while its workspace feature is disabled', async () => {
    const f = fixture();
    const token = issueAppealToken(wsId, key, now);
    await expect(
      confirmAppeal(token, {
        store: f.store,
        key,
        now,
        isEnabled: async () => false,
      })
    ).rejects.toMatchObject({
      code: 'flag_disabled',
      message: 'flag_disabled',
    });
    expect(f.store.confirm).not.toHaveBeenCalled();
  });
  it('refuses a token invalidated by a new suppression event', async () => {
    const f = fixture();
    f.store.confirm = vi.fn(async () => ({ status: 'reblocked' }));
    await expect(
      confirmAppeal(issueAppealToken(wsId, key, now), {
        store: f.store,
        key,
        now,
        isEnabled: async () => true,
      })
    ).rejects.toMatchObject({
      code: 'invalid_token',
      message: 'invalid_token',
    });
  });
});
