import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

import { createFakeCalendarOAuthNonceLedger } from './calendar-oauth-nonce-ledger.test-utils';
import { consumeCalendarOAuthNonce } from './calendar-oauth-nonce-store';

const expiresAt = Date.UTC(2026, 9, 24, 9, 10, 0);
const input = {
  expiresAt,
  nonce: 'nonce-1234567890abcdef',
  provider: 'google' as const,
  userId: '00000000-0000-4000-8000-000000000001',
};

describe('calendar OAuth nonce store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('consumes a nonce once through the private RPC and reports replays', async () => {
    const ledger = createFakeCalendarOAuthNonceLedger();
    createAdminClientMock.mockResolvedValue(ledger.client);

    await expect(consumeCalendarOAuthNonce(input)).resolves.toBe('consumed');
    await expect(consumeCalendarOAuthNonce(input)).resolves.toBe('replayed');
    expect(createAdminClientMock).toHaveBeenCalledWith({ noCookie: true });
    expect(ledger.calls[0]).toEqual({
      args: {
        p_expires_at: '2026-10-24T09:10:00.000Z',
        p_nonce: 'nonce-1234567890abcdef',
        p_provider: 'google',
        p_user_id: '00000000-0000-4000-8000-000000000001',
      },
      fn: 'consume_calendar_oauth_state_nonce',
      schema: 'private',
    });
  });

  it.each([
    ['a missing RPC', { code: 'PGRST202', message: 'not found' }],
    ['a missing table', { code: '42P01', message: 'relation missing' }],
    ['rejected input', { code: '22023', message: 'invalid expiry' }],
  ])('fails closed on %s', async (_label, failure) => {
    const ledger = createFakeCalendarOAuthNonceLedger();
    ledger.failure = failure;

    await expect(
      consumeCalendarOAuthNonce({ ...input, client: ledger.client })
    ).resolves.toBe('unavailable');
  });

  it('fails closed on an unexpected RPC response', async () => {
    const client = {
      schema: () => ({ rpc: async () => ({ data: null, error: null }) }),
    };

    await expect(consumeCalendarOAuthNonce({ ...input, client })).resolves.toBe(
      'unavailable'
    );
  });

  it('fails closed when the admin client cannot be created', async () => {
    createAdminClientMock.mockRejectedValue(new Error('no service key'));

    await expect(consumeCalendarOAuthNonce(input)).resolves.toBe('unavailable');
  });
});
