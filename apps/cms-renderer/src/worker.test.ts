import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/first-site.json';
import { assertProductionMode } from './production-mode';
import { cacheRequest, type Environment, serve } from './worker';

const environment: Environment = {
  CMS_SITES: JSON.stringify({ 'first.invalid': { id: 'site-one', workspaceId: '00000000-0000-4000-8000-000000000001', defaultLocale: 'vi' } }),
  CMS_PURGE_RATE_LIMITER: { limit: async () => ({ success: true }) },
  CMS_DELIVERY_ORIGIN: 'https://delivery.invalid', CMS_PURGE_TOKENS: JSON.stringify({ 'site-one': 'a'.repeat(64), 'site-two': 'b'.repeat(64) }),
};
function harness() {
  const items = new Map<string, Response>();
  const purgeKeys: string[] = [];
  const testEnvironment: Environment = {
    ...environment,
    CMS_PURGE_RATE_LIMITER: {
      limit: async ({ key }: { key: string }) => {
        purgeKeys.push(key);
        return { success: true };
      },
    },
  };
  let version = '11111111-1111-4111-8111-111111111111';
  let renders = 0;
  const cache = {
    match: async (request: RequestInfo | URL) => items.get(new Request(request).url)?.clone(),
    put: async (request: RequestInfo | URL, response: Response) => { items.set(new Request(request).url, response.clone()); },
    delete: async (request: RequestInfo | URL) => items.delete(new Request(request).url),
  };
  const delivery: typeof fetch = async () => Response.json({ workspaceId: '00000000-0000-4000-8000-000000000001', collections: [{ entries: [
    { id: 'home-id', status: 'published', slug: 'home', title: 'First site', publishedPageVersion: { id: version, schema_version: 1, blocks: fixture } },
    { id: 'en-id', status: 'published', slug: 'en', title: 'First site English', publishedPageVersion: { id: version, schema_version: 1, blocks: fixture } },
    { id: 'draft-id', status: 'published', slug: 'draft', title: 'Draft', publishedPageVersion: null },
  ] }] });
  return {
    run: (path: string, init?: RequestInit, env = testEnvironment) => serve(new Request(`https://first.invalid${path}`, init), env, {
      cache, fetch: delivery, render: async (_request, page) => { renders++; return new Response(`<html>${page.title}</html>`, { headers: { 'Content-Type': 'text/html' } }); },
    }),
    nextVersion: () => { version = '22222222-2222-4222-8222-222222222222'; },
    renders: () => renders,
    cacheKeys: () => [...items.keys()],
    purgeKeys: () => purgeKeys,
    environment: testEnvironment,
  };
}
describe('tenant published renderer', () => {
  it('refuses non-production startup before loading the server handler', () => {
    expect(() => assertProductionMode('production')).not.toThrow();
    for (const mode of [undefined, '', 'development', 'test']) {
      expect(() => assertProductionMode(mode)).toThrow('production server bundle');
    }
  });
  it('caches a snapshot and renders a newly published version separately', async () => {
    const h = harness();
    expect(await (await h.run('/')).text()).toContain('First site');
    await h.run('/'); expect(h.renders()).toBe(1);
    h.nextVersion(); await h.run('/'); expect(h.renders()).toBe(2);
  });
  it('supports the second locale and excludes draft pages', async () => {
    const h = harness();
    expect((await h.run('/en')).headers.get('content-language')).toBe('en');
    expect((await h.run('/draft')).status).toBe(404);
    expect((await h.run('/missing')).status).toBe(404);
    expect((await h.run('/', undefined, { ...environment, CMS_SITES: '{}' })).status).toBe(404);
  });
  it('requires purge authorization and invalidates the workspace namespace', async () => {
    const h = harness(); await h.run('/');
    const body = JSON.stringify({ scope: 'workspace' });
    expect((await h.run('/__cms/purge', { method: 'POST', body })).status).toBe(401);
    expect((await h.run('/__cms/purge', { method: 'POST', body, headers: { authorization: `Bearer ${'a'.repeat(64)}`, 'content-type': 'application/json' } })).status).toBe(204);
    await h.run('/'); expect(h.renders()).toBe(2);
  });
  it('binds purge authorization and workspace to the request host', async () => {
    const h = harness();
    const env = { ...h.environment, CMS_SITES: JSON.stringify({ 'first.invalid': { id: 'site-two', workspaceId: '00000000-0000-4000-8000-000000000002', defaultLocale: 'vi' } }) };
    const body = JSON.stringify({ scope: 'workspace' });
    const tokenA = `Bearer ${'a'.repeat(64)}`;
    const tokenB = `Bearer ${'b'.repeat(64)}`;
    expect((await h.run('/__cms/purge', { method: 'POST', body, headers: { authorization: tokenA, 'x-site-id': 'site-one', 'x-workspace-id': '00000000-0000-4000-8000-000000000001' } }, env)).status).toBe(401);
    expect((await h.run('/__cms/purge', { method: 'POST', body, headers: { authorization: tokenB, 'content-type': 'application/json' } }, env)).status).toBe(204);
    const epochKey = h.cacheKeys().find((key) => new URL(key).pathname === '/__cms/cache-epoch');
    expect(epochKey && new URL(epochKey).searchParams.get('site')).toBe('site-two');
    expect(epochKey && new URL(epochKey).searchParams.get('workspaceId')).toBe('00000000-0000-4000-8000-000000000002');
    expect(h.purgeKeys()).toEqual(['cms-purge:site-two']);
    const legacy = { ...environment, CMS_PURGE_TOKENS: undefined, CMS_PURGE_TOKEN: 'a'.repeat(64) };
    expect((await h.run('/__cms/purge', { method: 'POST', body, headers: { authorization: tokenA } }, legacy)).status).toBe(401);
  });
  it('does not share cache identities between sites or locales', () => {
    const input = { origin: 'https://first.invalid', site: 'a', path: '/', locale: 'vi', version: 'v1', workspaceId: '00000000-0000-4000-8000-000000000001', epoch: 'initial-test-epoch' };
    expect(cacheRequest(input).url).not.toBe(cacheRequest({ ...input, site: 'b' }).url);
    expect(cacheRequest(input).url).not.toBe(cacheRequest({ ...input, locale: 'en' }).url);
  });
});
