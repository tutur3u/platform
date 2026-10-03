import { expect, it, vi } from 'vitest';
import { getExchangeRates } from './finance-exchange-rates';

it('uses authenticated no-store API transport and preserves the rates envelope', async () => {
  const envelope = { data: [], date: '2026-10-03' };
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(envelope)));
  expect(
    await getExchangeRates({
      baseUrl: 'https://finance.test',
      fetch,
      defaultHeaders: { authorization: 'Bearer synthetic-session' },
    })
  ).toEqual(envelope);
  const [url, init] = fetch.mock.calls[0]!;
  expect(String(url)).toBe('https://finance.test/api/v1/exchange-rates');
  expect(init.cache).toBe('no-store');
  expect(new Headers(init.headers).get('authorization')).toBe(
    'Bearer synthetic-session'
  );
});
it('propagates authentication failure instead of displaying empty exchange rates', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    );
  await expect(
    getExchangeRates({ baseUrl: 'https://finance.test', fetch })
  ).rejects.toMatchObject({ status: 401 });
});
