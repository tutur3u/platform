import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOriginClientIpProof } from '@tuturuuu/utils/abuse-protection/origin-ip-proof';
import type { CitationBudgetStore } from './budget-store';
import { reserveCitationLookup } from './lookup-budget';
import {
  LOOKUP_FALLBACK_GLOBAL_LIMIT,
  LOOKUP_FALLBACK_IP_LIMIT,
  resetInstanceLookupBudget,
} from './lookup-budget-fallback';

vi.mock('server-only', () => ({}));
const syntheticOriginSecret = 'synthetic-citation-origin-proof-fixture-only';
const unknownBucket = createHash('sha256').update('unknown').digest('hex');
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
function fixture(admitted = true) {
  const reserve = vi
    .fn<CitationBudgetStore['reserve']>()
    .mockResolvedValue(admitted);
  return {
    reserve,
    store: vi.fn(async () => ({ reserve })),
    proxyOptions,
  };
}

beforeEach(() => {
  resetInstanceLookupBudget();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

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
    expect(test.reserve).toHaveBeenCalledTimes(1);
  });

  it('does not honor a spoofed Cloudflare client IP without origin proof', async () => {
    const test = fixture();
    const headers = new Headers({
      'cf-connecting-ip': '198.51.100.1',
      'x-tuturuuu-origin-auth': 'invalid-proof',
    });
    expect(
      await reserveCitationLookup(headers, { ...test, now: () => 120_000 })
    ).toEqual({ kind: 'allowed' });
    expect(test.reserve.mock.calls[0]?.[0].actorHash).toBe(unknownBucket);
    expect(test.reserve.mock.calls[0]?.[0].actorHash).not.toBe(
      createHash('sha256').update('198.51.100.1').digest('hex')
    );
  });

  it('never trusts the client-supplied Cloudflare IP under an unauthenticated configuration', async () => {
    for (const env of [
      {},
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
          now: () => 120_000,
        })
      ).toEqual({ kind: 'allowed' });
      expect(test.reserve.mock.calls[0]?.[0].actorHash).not.toBe(
        createHash('sha256').update('198.51.100.1').digest('hex')
      );
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
    expect(test.reserve.mock.calls[0]?.[0]).toEqual(
      test.reserve.mock.calls[1]?.[0]
    );
  });

  it('uses the platform-resolved client address under Vercel and shares one bucket when none resolves', async () => {
    const vercel = fixture();
    expect(
      await reserveCitationLookup(
        new Headers({ 'x-vercel-forwarded-for': '198.51.100.7' }),
        {
          ...vercel,
          proxyOptions: {
            env: { TRUSTED_PROXY: 'vercel' },
            runtimeUserAgent: null,
          },
          now: () => 120_000,
        }
      )
    ).toEqual({ kind: 'allowed' });
    expect(vercel.reserve.mock.calls[0]?.[0].actorHash).toBe(
      createHash('sha256').update('198.51.100.7').digest('hex')
    );
    const anonymous = fixture();
    expect(
      await reserveCitationLookup(new Headers(), {
        ...anonymous,
        now: () => 120_000,
      })
    ).toEqual({ kind: 'allowed' });
    expect(anonymous.reserve.mock.calls[0]?.[0].actorHash).toBe(unknownBucket);
  });

  it('reserves per-IP and shared global counters in one atomic store operation', async () => {
    const test = fixture();
    const headers = trustedHeaders();
    expect(
      await reserveCitationLookup(headers, { ...test, now: () => 120_000 })
    ).toEqual({ kind: 'allowed' });
    expect(test.reserve).toHaveBeenCalledTimes(1);
    expect(test.reserve).toHaveBeenCalledExactlyOnceWith({
      scope: 'lookup',
      actorHash: createHash('sha256').update('198.51.100.1').digest('hex'),
      window: 2,
      actorLimit: 10,
      globalLimit: 120,
    });
  });

  it('treats a denied shared claim as final', async () => {
    expect(
      await reserveCitationLookup(trustedHeaders(), fixture(false))
    ).toMatchObject({ kind: 'rejected', status: 429 });
  });

  describe.each([
    ['a missing store', async () => null],
    [
      'a failing store',
      async () => {
        throw new Error('unavailable');
      },
    ],
  ])('with %s', (_name, store) => {
    it('serves lookups from the per-instance budget and raises an alert', async () => {
      const alert = vi.mocked(console.error);
      const input = { proxyOptions, store, now: () => 120_000 };
      for (let used = 0; used < LOOKUP_FALLBACK_IP_LIMIT; used += 1)
        expect(await reserveCitationLookup(trustedHeaders(), input)).toEqual({
          kind: 'allowed',
          fallback: true,
        });
      expect(
        await reserveCitationLookup(trustedHeaders(), input)
      ).toMatchObject({ kind: 'rejected', status: 429 });
      expect(alert).toHaveBeenCalledWith('cite_lookup_budget_fallback');
      expect(alert).toHaveBeenCalledTimes(1);
    });

    it('caps the instance total across clients and recovers next minute', async () => {
      const input = { proxyOptions, store, now: () => 120_000 };
      for (let index = 0; index < LOOKUP_FALLBACK_GLOBAL_LIMIT; index += 1)
        expect(
          await reserveCitationLookup(
            trustedHeaders(`198.51.100.${(index % 250) + 1}`),
            { ...input, now: () => 120_000 }
          )
        ).toEqual({ kind: 'allowed', fallback: true });
      expect(
        await reserveCitationLookup(trustedHeaders('203.0.113.77'), input)
      ).toMatchObject({ kind: 'rejected', status: 429 });
      expect(
        await reserveCitationLookup(trustedHeaders('203.0.113.77'), {
          ...input,
          now: () => 180_000,
        })
      ).toEqual({ kind: 'allowed', fallback: true });
    });
  });
});
