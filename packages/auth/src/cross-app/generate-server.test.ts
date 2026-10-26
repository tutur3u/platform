import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { readMfaTransfer } from '@tuturuuu/utils/required-mfa-transfer';
import fc from 'fast-check';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { generateAssuredCrossAppToken } from './generate-server';

const mocks = vi.hoisted(() => ({ assurance: vi.fn() }));
vi.mock('@tuturuuu/utils/required-mfa-request', () => ({
  checkRequiredAccountMfa: mocks.assurance,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
const now = Date.UTC(2026, 9, 26) / 1000;
const proof = {
  sessionId: 'session',
  verifiedAt: now - 5,
  expiresAt: now + 60,
};
function client() {
  const rpc = vi.fn(
    async (_name: string, _args: { p_expiry_seconds: number }) => ({
      data: 'handoff',
      error: null,
    })
  );
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
  vi.useFakeTimers();
  vi.setSystemTime(now * 1000);
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'handoff-test-secret');
  mocks.assurance.mockResolvedValue({ status: 'allowed', proof });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
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

it('clamps requested handoff lifetimes to the existing main TypeScript bounds', async () => {
  // fast-check records the fixed seed and shrunk path in a failure report.
  // The tighter database caps in #6840 are not part of this main-only test.
  await fc.assert(
    fc.asyncProperty(
      fc.integer(),
      fc.constantFrom('web', 'cli', 'finance'),
      async (requested, origin) => {
        const { supabase, rpc } = client();
        expect(
          await generateAssuredCrossAppToken(
            new Request('https://example.com'),
            supabase,
            'platform',
            origin,
            requested
          )
        ).toBe('handoff');
        expect(rpc).toHaveBeenCalledOnce();
        const actual = rpc.mock.calls[0]?.[1].p_expiry_seconds;
        expect(actual).toBeGreaterThanOrEqual(1);
        expect(actual).toBeLessThanOrEqual(300);
        if (requested >= 1 && requested <= 300) expect(actual).toBe(requested);
        if (requested < 1) expect(actual).toBe(1);
        if (requested > 300) expect(actual).toBe(300);
      }
    ),
    { seed: 20261026, numRuns: 250 }
  );
});

it('requests the existing 300-second default lifetime', async () => {
  const { supabase, rpc } = client();
  await generateAssuredCrossAppToken(
    new Request('https://example.com'),
    supabase,
    'finance',
    'web'
  );
  expect(rpc).toHaveBeenCalledWith(
    'generate_cross_app_token',
    expect.objectContaining({ p_expiry_seconds: 300 })
  );
});
