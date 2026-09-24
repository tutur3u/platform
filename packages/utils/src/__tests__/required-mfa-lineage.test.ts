import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { expect, it, vi } from 'vitest';
import { bindCurrentMfaFactor } from '../required-mfa-lineage';

const proof = {
  sessionId: 'session',
  verifiedAt: 104,
  primaryVerifiedAt: 103,
  factorId: 'removed-factor',
};
it('rejects late verification whose original factor was deleted', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  expect(
    await bindCurrentMfaFactor(
      { rpc } as unknown as TypedSupabaseClient,
      'actor',
      proof
    )
  ).toBeNull();
});
it('a newly enrolled factor cannot revive an old signed proof', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: 'new-factor', error: null });
  expect(
    await bindCurrentMfaFactor(
      { rpc } as unknown as TypedSupabaseClient,
      'actor',
      proof
    )
  ).toBeNull();
});
it('binds a provider-verified session once, then retains its exact factor id', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: 'new-factor', error: null });
  const admin = { rpc } as unknown as TypedSupabaseClient;
  const raw = { sessionId: 'session', verifiedAt: 104, primaryVerifiedAt: 103 };
  expect(await bindCurrentMfaFactor(admin, 'actor', raw)).toBeNull();
  expect(await bindCurrentMfaFactor(admin, 'actor', raw, true)).toEqual({
    ...raw,
    factorId: 'new-factor',
  });
});
