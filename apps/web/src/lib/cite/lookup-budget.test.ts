import { describe, expect, it, vi } from 'vitest';
import { reserveCitationLookup } from './lookup-budget';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: vi.fn(),
}));

function fixture(admitted: unknown = 1) {
  const evalBudget = vi.fn(async () => admitted);
  return { evalBudget, store: async () => ({ eval: evalBudget }) };
}

describe('anonymous citation lookup budget', () => {
  it('requires CF-Connecting-IP and ignores forwarding header substitutes', async () => {
    for (const headers of [
      new Headers(),
      new Headers({
        'x-forwarded-for': '198.51.100.1',
        'x-real-ip': '198.51.100.2',
      }),
      new Headers({ 'cf-connecting-ip': 'invalid' }),
      new Headers({ 'cf-connecting-ip': '198.51.100.1, 198.51.100.2' }),
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
    const headers = new Headers({ 'cf-connecting-ip': '198.51.100.1' });
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
    const headers = new Headers({ 'cf-connecting-ip': '198.51.100.1' });
    expect(await reserveCitationLookup(headers, fixture(0))).toMatchObject({
      status: 429,
    });
    expect(
      await reserveCitationLookup(headers, { store: async () => null })
    ).toMatchObject({ status: 503 });
    expect(
      await reserveCitationLookup(headers, {
        store: async () => {
          throw new Error('unavailable');
        },
      })
    ).toMatchObject({ status: 503 });
  });
});
