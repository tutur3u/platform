import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { type Policy, readPolicy, toPublicComponent } from './public-dto';
import { CURRENT_KEY, type Env, FALLBACK_KEY, handleRequest } from './worker';

const GEN = '2026-11-03T02:22:00Z';
const T0 = Date.parse(GEN);
const NO_DATA =
  '{"status":"unknown","components":[],"generated_at":null,"stale":true,"fallback":true}';
const ROUTES = ['', '/summary', '/components', '/incidents', '/badge/web-app'];
const CC = /^public, max-age=0, s-maxage=(\d+), stale-while-revalidate=(\d+)$/;
const item = (id: string, status = 'operational', tier = 'primary') => {
  return { id, tier, status, updated_at: '2026-11-03T02:21:30Z' };
};
const snap = (over: Record<string, unknown> = {}) => {
  const components = [item('web-app'), item('api-gateway')];
  const base = { version: 1, generated_at: GEN };
  const rest = { publisher_available: true, history: components };
  return JSON.stringify({ ...base, ...rest, components, ...over });
};
const env = (kv: Record<string, string>, over: Partial<Env> = {}): Env => ({
  STATUS_SNAPSHOTS: { get: async (key) => kv[key] ?? null },
  STATUS_PUBLIC_COMPONENT_IDS: 'web-app,api-gateway,client-a,deny-a',
  STATUS_OWNED_COMPONENT_IDS: 'web-app,deny-a,owned-x', // trusted config only
  STATUS_CLIENT_CONSENT_IDS: '',
  STATUS_NEVER_PUBLIC_IDS: 'deny-a',
  ...over,
});
async function get(e: Env, route = '/summary', now = T0, tag = '') {
  const headers = tag ? { 'if-none-match': tag } : undefined;
  const url = `https://status.test/api/v1/status${route}`;
  const res = await handleRequest(new Request(url, { headers }), e, now);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  const ids = body?.components.map((c: { id: string }) => c.id) ?? [];
  const cache = res.headers.get('cache-control');
  if (body && cache !== 'no-store') {
    const [, ttl, swr] = CC.exec(`${cache}`) ?? []; // no stale-if-error
    expect(+ttl! + +swr!).toBeLessThanOrEqual(120 - (now - T0) / 1e3); // GEN
  }
  const etag = res.headers.get('etag');
  return { text, ids, body, cache, etag, code: res.status };
}

// V9: any network call made by the Worker under test throws.
globalThis.fetch = (() => {
  throw new Error('status worker must not call the network');
}) as unknown as typeof fetch;

test('allowlist constructor copies only id, status, coarse updated_at', async () => {
  const leaks = {
    ...{ url: 'https://leak.example/a', path: '/leak/auth/session' },
    ...{ headers: { 'x-leak': 'leak-value' }, marker: 'LEAK-MARKER' },
    ...{ latency_ms: 81234, ip: '10.9.8.7', owner: 'leak@example.com' },
    ...{ tenant_id: 'leak-t', body: '<html>', nested: { deep: 'leak-n' } },
  };
  const updated_at = '2026-11-03T02:21:59.999Z';
  const raw = { ...item('web-app'), ...leaks, updated_at };
  const minute = '2026-11-03T02:21:00Z';
  const exact = { id: 'web-app', status: 'operational', updated_at: minute };
  const policy = readPolicy(env({})) as Policy; // web-app: approved, owned
  expect(toPublicComponent(raw, policy, false) as object).toEqual(exact);
  const leaky = snap({ components: [raw], history: [raw], ...leaks });
  for (const route of ROUTES) {
    const { text, body } = await get(env({ [CURRENT_KEY]: leaky }), route);
    expect(Object.keys(body)).toEqual(Object.keys(JSON.parse(NO_DATA)));
    for (const component of body.components) expect(component).toEqual(exact);
    expect(text).not.toMatch(/leak|LEAK|81234|10\.9\.8\.7|html/);
  }
});

test('consent unless policy-owned; snapshot tier ignored; never-public', async () => {
  const hidden = ['client-a', 'deny-a', 'api-gateway', 'owned-x']; // tier: primary
  const components = hidden.map((id) => item(id, 'major_outage'));
  components.unshift(item('web-app', 'operational', 'client')); // policy-owned
  const kv = { [CURRENT_KEY]: snap({ components, history: components }) };
  for (const route of ROUTES.slice(0, 4)) {
    const { body, ids } = await get(env(kv), route);
    expect(ids).toEqual(route ? ['web-app'] : []);
    expect(body.status).toBe('operational'); // excluded outages never count
  }
  for (const id of ['client-a', 'deny-a', 'owned-x', 'no-such-id', 'BAD!']) {
    const { code, text } = await get(env(kv), `/badge/${id}`);
    expect([code, text]).toEqual([404, '']); // indistinguishable
  }
  const ok = env(kv, { STATUS_CLIENT_CONSENT_IDS: 'client-a,deny-a' });
  expect((await get(ok, '/components')).ids).toEqual(['web-app', 'client-a']);
  expect((await get(ok, '/badge/deny-a')).code).toBe(404);
  const noPolicy = await get(env(kv, { STATUS_NEVER_PUBLIC_IDS: undefined }));
  expect([noPolicy.ids, noPolicy.body.status]).toEqual([[], 'unknown']);
  const unowned = env(kv, { STATUS_OWNED_COMPONENT_IDS: undefined });
  expect((await get(unowned, '/components')).ids).toEqual([]);
});

test('stale, unavailable publisher or fallback => unknown + no-store', async () => {
  const future = snap({ generated_at: '2026-11-03T02:30:00Z' });
  const cases: [Record<string, string>, number, boolean][] = [
    [{ [CURRENT_KEY]: snap() }, T0 + 121_000, false],
    [{ [CURRENT_KEY]: snap({ publisher_available: false }) }, T0, false],
    [{ [FALLBACK_KEY]: snap() }, T0, true],
    [{ [CURRENT_KEY]: '{bad json', [FALLBACK_KEY]: snap() }, T0, true],
    [{ [CURRENT_KEY]: future, [FALLBACK_KEY]: snap() }, T0, true],
  ];
  for (const [kv, now, fallback] of cases)
    for (const route of ROUTES) {
      const { code, cache, body } = await get(env(kv), route, now);
      expect([code, cache]).toEqual([200, 'no-store']);
      expect(body).toMatchObject({ status: 'unknown', stale: true, fallback });
      for (const c of body.components) expect(c.status).toBe('unknown');
    }
});

test('empty or unusable KV => explicit unknown 503, never a fake time', async () => {
  const bad = env({ [CURRENT_KEY]: snap({ generated_at: 'yesterday' }) });
  for (const e of [env({}), bad, env({}, { STATUS_SNAPSHOTS: undefined })])
    for (const route of ROUTES) {
      const { code, cache, text } = await get(e, route);
      expect([code, cache, text]).toEqual([503, 'no-store', NO_DATA]);
    }
});

test('cache + SWR end inside freshness; ETag covers it; 304 keeps age', async () => {
  const e = env({ [CURRENT_KEY]: snap() });
  for (let age = 0; age <= 120_000; age += 5_000)
    for (const route of ROUTES) await get(e, route, T0 + age); // see get()
  const fresh = await get(e, '', T0 + 110_000); // quick: no components
  expect(fresh.body).toMatchObject({ status: 'operational', stale: false });
  const etag = fresh.etag ?? '';
  expect(etag).toMatch(/^W\/"[A-Za-z0-9+/]{43}="$/);
  const hit = await get(e, '', T0 + 115_000, etag);
  expect([hit.code, hit.text, hit.etag]).toEqual([304, '', etag]);
  const aged = await get(e, '', T0 + 121_000, etag);
  expect([aged.code, aged.etag === etag]).toEqual([200, false]);
  expect(aged.body).toMatchObject({ status: 'unknown', generated_at: GEN });
});

test('unknown routes, write methods and platform deps are rejected (V9)', async () => {
  const e = env({ [CURRENT_KEY]: snap() });
  for (const route of ['/other', '/badge', '/summary/x', '/../admin', '/'])
    expect((await get(e, route)).code).toBe(404);
  const post = new Request('https://s.test/api/v1/status', { method: 'POST' });
  expect((await handleRequest(post, e, T0)).status).toBe(405);
  const dir = new URL('.', import.meta.url).pathname;
  for (const file of readdirSync(dir).filter((f) => !f.includes('.test.'))) {
    const src = readFileSync(`${dir}${file}`, 'utf8');
    expect(src).not.toMatch(/\bfetch\(|https?:|process\.env|\.put\(/);
    const specs = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(specs.every((spec) => spec?.startsWith('./'))).toBe(true);
  }
});
