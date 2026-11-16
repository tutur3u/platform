import { describe, expect, it, vi } from 'vitest';
import { createOriginClientIpProof } from '@tuturuuu/utils/abuse-protection/origin-ip-proof';
import { reserveCitationLookup } from './lookup-budget';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: vi.fn(),
}));

const syntheticOriginSecret = 'synthetic-citation-origin-proof-fixture-only';
const proxyOptions = {
  env: {
    TRUSTED_PROXY: 'cloudflare-origin',
    TRUSTED_PROXY_ORIGIN_SECRET: syntheticOriginSecret,
  },
  runtimeUserAgent: null,
};
function trustedHeaders(ip = '198.51.100.1') {
  return new Headers({
    'cf-connecting-ip': ip,
    'x-tuturuuu-origin-auth': syntheticOriginSecret,
  });
}
function fixture(admitted: unknown = 1) {
  const evalBudget = vi.fn(
    async (_script: string, _keys: string[], _args: (string | number)[]) =>
      admitted
  );
  return {
    evalBudget,
    store: vi.fn(async () => ({ eval: evalBudget })),
    proxyOptions,
  };
}

describe('anonymous citation lookup budget', () => {
  it('accepts an explicitly injected trusted proxy config without reading deployment env', async () => {
    const test = fixture();
    expect(
      await reserveCitationLookup(trustedHeaders(), {
        ...test,
        proxyOptions: {
          env: { TRUSTED_PROXY: 'none' },
          runtimeUserAgent: null,
        },
        proxyConfig: {
          mode: 'cloudflare-origin',
          trustedHops: 1,
          originAuthSecret: syntheticOriginSecret,
        },
      })
    ).toEqual({ kind: 'allowed' });
    expect(test.evalBudget).toHaveBeenCalledTimes(1);
  });

  it('rejects spoofed Cloudflare client headers before Redis without origin proof', async () => {
    const test = fixture();
    const headers = new Headers({
      'cf-connecting-ip': '198.51.100.1',
      'x-forwarded-for': '198.51.100.2',
      'x-real-ip': '198.51.100.3',
    });
    expect(await reserveCitationLookup(headers, test)).toMatchObject({
      kind: 'rejected',
      status: 429,
    });
    expect(test.store).not.toHaveBeenCalled();
    expect(test.evalBudget).not.toHaveBeenCalled();
  });

  it('rejects absent, invalid or weak origin configuration even with client headers', async () => {
    for (const env of [
      {},
      { TRUSTED_PROXY: 'cloudflare' },
      { TRUSTED_PROXY: 'vercel' },
      { TRUSTED_PROXY: 'cloudflare-origin' },
      {
        TRUSTED_PROXY: 'cloudflare-origin',
        TRUSTED_PROXY_ORIGIN_SECRET: 'weak-fixture',
      },
    ]) {
      const test = fixture();
      expect(
        await reserveCitationLookup(trustedHeaders(), {
          ...test,
          proxyOptions: { env, runtimeUserAgent: null },
        })
      ).toMatchObject({ kind: 'rejected', status: 429 });
      expect(test.store).not.toHaveBeenCalled();
    }
  });

  it('uses the authenticated signed client identity rather than a spoofed CF header', async () => {
    const proof = createOriginClientIpProof({
      ip: '198.51.100.1',
      secret: syntheticOriginSecret,
    });
    if (!proof) throw new Error('Synthetic origin proof must be valid');
    const test = fixture();
    for (const clientHeader of ['198.51.100.2', '198.51.100.3']) {
      expect(
        await reserveCitationLookup(
          new Headers({
            'cf-connecting-ip': clientHeader,
            'x-tuturuuu-origin-auth': proof,
          }),
          { ...test, now: () => 120_000 }
        )
      ).toEqual({ kind: 'allowed' });
    }
    expect(test.evalBudget.mock.calls[0]?.[1]).toEqual(
      test.evalBudget.mock.calls[1]?.[1]
    );
  });

  it('rejects a wrong origin proof without falling back to XFF', async () => {
    const test = fixture();
    const headers = trustedHeaders();
    headers.set('x-tuturuuu-origin-auth', 'invalid-proof');
    headers.set('x-forwarded-for', '198.51.100.2');
    expect(await reserveCitationLookup(headers, test)).toMatchObject({
      status: 429,
    });
    expect(test.store).not.toHaveBeenCalled();
  });
  it('requires CF-Connecting-IP and ignores forwarding header substitutes', async () => {
    for (const headers of [
      new Headers({ 'x-tuturuuu-origin-auth': syntheticOriginSecret }),
      new Headers({
        'x-tuturuuu-origin-auth': syntheticOriginSecret,
        'x-forwarded-for': '198.51.100.1',
        'x-real-ip': '198.51.100.2',
      }),
      trustedHeaders('invalid'),
      trustedHeaders('198.51.100.1, 198.51.100.2'),
    ]) {
      const test = fixture();
      expect(await reserveCitationLookup(headers, test)).toMatchObject({
        kind: 'rejected',
        status: 429,
      });
      expect(test.evalBudget).not.toHaveBeenCalled();
    }
  });

  it('reserves per-IP and shared global counters in one atomic store operation', async () => {
    const test = fixture();
    const headers = trustedHeaders();
    expect(
      await reserveCitationLookup(headers, { ...test, now: () => 120_000 })
    ).toEqual({ kind: 'allowed' });
    expect(test.evalBudget).toHaveBeenCalledTimes(1);
    expect(test.evalBudget).toHaveBeenCalledWith(
      expect.any(String),
      [
        expect.stringMatching(/^cite:lookup:\{budget\}:2:ip:[a-f0-9]{64}$/),
        'cite:lookup:{budget}:2:global',
      ],
      [10, 120, 120]
    );
  });

  it('rejects a denied claim and fails closed on missing or failed storage', async () => {
    const headers = trustedHeaders();
    expect(await reserveCitationLookup(headers, fixture(0))).toMatchObject({
      status: 429,
    });
    expect(
      await reserveCitationLookup(headers, {
        proxyOptions,
        store: async () => null,
      })
    ).toMatchObject({ status: 503 });
    expect(
      await reserveCitationLookup(headers, {
        proxyOptions,
        store: async () => {
          throw new Error('unavailable');
        },
      })
    ).toMatchObject({ status: 503 });
  });
});
