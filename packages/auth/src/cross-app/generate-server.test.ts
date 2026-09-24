import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { readMfaTransfer } from '@tuturuuu/utils/required-mfa-transfer';
import { beforeEach, expect, it, vi } from 'vitest';
import { generateAssuredCrossAppToken } from './generate-server';

const mocks = vi.hoisted(() => ({ assurance: vi.fn() }));
vi.mock('@tuturuuu/utils/required-mfa-request', () => ({
  checkRequiredAccountMfa: mocks.assurance,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
const now = Math.floor(Date.now() / 1000);
const proof = {
  sessionId: 'session',
  verifiedAt: now - 5,
  expiresAt: now + 60,
};
function client() {
  const rpc = vi.fn(async () => ({ data: 'handoff', error: null }));
  const supabase = {
    rpc,
    auth: {
      getUser: async () => ({
        data: { user: { id: 'actor', email: 'actor@example.com' } },
        error: null,
      }),
      getClaims: async () => ({
        data: { claims: { sub: 'actor', aal: 'aal1' } },
        error: null,
      }),
    },
  } as unknown as TypedSupabaseClient;
  return { rpc, supabase };
}
beforeEach(() => {
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'handoff-test-secret');
  mocks.assurance.mockResolvedValue({ status: 'allowed', proof });
});
it('carries original mobile proof in a separately signed target-bound transfer', async () => {
  const { supabase, rpc } = client();
  expect(
    await generateAssuredCrossAppToken(
      new Request('https://example.com'),
      supabase,
      'platform',
      'cli'
    )
  ).toBe('handoff');
  const args = rpc.mock.calls[0] as unknown as [
    string,
    { p_session_data: { mfaTransfer: string } },
  ];
  expect(
    readMfaTransfer(args[1].p_session_data.mfaTransfer, 'actor', 'platform')
  ).toEqual(proof);
  expect(
    readMfaTransfer(args[1].p_session_data.mfaTransfer, 'other', 'platform')
  ).toBeNull();
});
it('does not issue a CLI or browser handoff without required assurance', async () => {
  const { supabase, rpc } = client();
  mocks.assurance.mockResolvedValue({ status: 'required' });
  expect(
    await generateAssuredCrossAppToken(
      new Request('https://example.com'),
      supabase,
      'platform',
      'cli'
    )
  ).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
});
