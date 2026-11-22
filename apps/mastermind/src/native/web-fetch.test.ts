import { expect, test, vi } from 'vitest';
import {
  installWebUserAgent,
  MASTERMIND_USER_AGENT,
  withWebUserAgent,
} from './web-fetch';

function recorder() {
  const seen: Request[] = [];
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return new Response('ok');
    }
  );
  return { seen, fetcher: fetcher as unknown as typeof fetch };
}

test('names the Worker on Web calls that carry no User-Agent', async () => {
  const { seen, fetcher } = recorder();
  const web = withWebUserAgent(fetcher);
  await web(
    new Request('https://tuturuuu.com/api/v1/auth/cross-app-token/verify', {
      method: 'POST',
      headers: { 'x-tuturuuu-app-redeem-proof': 'p' },
      body: '{}',
    })
  );
  await web('https://tuturuuu.com/api/v1/mastermind/access', {
    headers: { Authorization: 'Bearer t' },
  });
  expect(seen.map((r) => r.headers.get('user-agent'))).toEqual([
    MASTERMIND_USER_AGENT,
    MASTERMIND_USER_AGENT,
  ]);
  expect(seen[0]?.method).toBe('POST');
  expect(await seen[0]?.text()).toBe('{}');
  expect(seen[0]?.headers.get('x-tuturuuu-app-redeem-proof')).toBe('p');
  expect(seen[1]?.headers.get('authorization')).toBe('Bearer t');
});

test('leaves other origins and an explicit User-Agent unchanged', async () => {
  const { seen, fetcher } = recorder();
  const web = withWebUserAgent(fetcher);
  await web('https://ops-hub/snapshot');
  await web('https://tuturuuu.com.example.org/x');
  await web('https://tuturuuu.com/x', { headers: { 'User-Agent': 'Own/1' } });
  expect(seen.map((r) => r.headers.get('user-agent'))).toEqual([
    null,
    null,
    'Own/1',
  ]);
});

test('installs on the global fetch once', async () => {
  const { seen, fetcher } = recorder();
  const target = { fetch: fetcher } as unknown as typeof globalThis;
  installWebUserAgent(target);
  installWebUserAgent(target);
  await target.fetch('https://tuturuuu.com/api/v1/fleet/access');
  expect(seen).toHaveLength(1);
  expect(seen[0]?.headers.get('user-agent')).toBe(MASTERMIND_USER_AGENT);
});
