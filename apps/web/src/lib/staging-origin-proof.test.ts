// @vitest-environment node
import { createOriginClientIpProof } from '@tuturuuu/utils/abuse-protection/origin-ip-proof';
import { describe, expect, it, vi } from 'vitest';
import { withStagingOriginProof } from './staging-origin-proof';

const secret = 'disposable-test-origin-proof-key-123456';
const staging = {
  NEXT_PUBLIC_TUTURUUU_STAGING: '1',
  TRUSTED_PROXY_ORIGIN_SECRET: secret,
};
const forbidden = () => new Response('Forbidden', { status: 403 });

function gate(env: Record<string, string | undefined>) {
  const handler = vi.fn(async () => new Response('next'));
  return { handler, proxy: withStagingOriginProof(handler, forbidden, env) };
}
const request = (proof?: string | null) =>
  new Request('https://tuturuuu-web-staging-abc.vercel.app/login', {
    headers: proof ? { 'x-tuturuuu-origin-auth': proof } : {},
  });

// N15: a direct Vercel hit with a valid bypass but no origin proof gets 403.
describe('staging origin-proof gate (V1a, N15)', () => {
  it('admits only a fresh HMAC proof made with the staging secret', async () => {
    const { handler, proxy } = gate(staging);
    const proof = createOriginClientIpProof({ ip: '203.0.113.10', secret });
    expect((await proxy(request(proof))).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing', null],
    ['raw shared secret', secret],
    [
      'wrong key',
      createOriginClientIpProof({ ip: '203.0.113.10', secret: 'x'.repeat(40) }),
    ],
    [
      'stale',
      createOriginClientIpProof({
        ip: '203.0.113.10',
        secret,
        nowSeconds: Math.floor(Date.now() / 1000) - 120,
      }),
    ],
    ['malformed', 'hmac-v1;garbage'],
  ])(
    'rejects a %s proof with 403 before any proxy work',
    async (_label, proof) => {
      const { handler, proxy } = gate(staging);
      expect((await proxy(request(proof))).status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, '', 'short'])(
    'fails closed when the staging secret is %j',
    async (value) => {
      const { handler, proxy } = gate({
        ...staging,
        TRUSTED_PROXY_ORIGIN_SECRET: value,
      });
      const proof = createOriginClientIpProof({ ip: '203.0.113.10', secret });
      expect((await proxy(request(proof))).status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, '0', 'true'])(
    'leaves non-staging deployments untouched (flag %j)',
    async (flag) => {
      const { handler, proxy } = gate({ NEXT_PUBLIC_TUTURUUU_STAGING: flag });
      expect((await proxy(request())).status).toBe(200);
      expect(handler).toHaveBeenCalledTimes(1);
    }
  );
});
