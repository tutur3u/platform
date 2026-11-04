import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/first-site.json';
import { cacheRequest, serve, type Environment } from './worker';
import { assertProductionMode } from './production-mode';

const environment: Environment = {
  CMS_SITES: JSON.stringify({ 'first.invalid': { id: 'site-one', workspaceId: '00000000-0000-4000-8000-000000000001', defaultLocale: 'vi' } }),
  CMS_DELIVERY_ORIGIN: 'https://delivery.invalid', CMS_PURGE_TOKEN: 'synthetic-test-token',
};
function harness() {
  const items = new Map<string, Response>();
  let version = 'version-one';
  let renders = 0;
  const cache = {
    match: async (request: RequestInfo | URL) => items.get(new Request(request).url)?.clone(),
    put: async (request: RequestInfo | URL, response: Response) => { items.set(new Request(request).url, response.clone()); },
    delete: async (request: RequestInfo | URL) => items.delete(new Request(request).url),
  };
  const delivery: typeof fetch = async () => Response.json({ collections: [{ entries: [
    { slug: 'home', title: 'First site', publishedPageVersion: { id: version, schema_version: 1, blocks: fixture } },
    { slug: 'en', title: 'First site English', publishedPageVersion: { id: version, schema_version: 1, blocks: fixture } },
    { slug: 'draft', title: 'Draft', publishedPageVersion: null },
  ] }] });
  return {
    run: (path: string, init?: RequestInit, env = environment) => serve(new Request(`https://first.invalid${path}`, init), env, {
      cache, fetch: delivery, render: async (_request, page) => { renders++; return new Response(`<html>${page.title}</html>`, { headers: { 'Content-Type': 'text/html' } }); },
    }),
    nextVersion: () => { version = 'version-two'; },
    renders: () => renders,
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
  it('requires purge authorization and invalidates only the specified version', async () => {
    const h = harness(); await h.run('/');
    const body = JSON.stringify({ path: '/', locale: 'vi', version: 'version-one' });
    expect((await h.run('/__cms/purge', { method: 'POST', body })).status).toBe(403);
    expect((await h.run('/__cms/purge', { method: 'POST', body, headers: { authorization: 'Bearer synthetic-test-token' } })).status).toBe(204);
    await h.run('/'); expect(h.renders()).toBe(2);
  });
  it('does not share cache identities between sites or locales', () => {
    const input = { origin: 'https://first.invalid', site: 'a', path: '/', locale: 'vi', version: 'v1' };
    expect(cacheRequest(input).url).not.toBe(cacheRequest({ ...input, site: 'b' }).url);
    expect(cacheRequest(input).url).not.toBe(cacheRequest({ ...input, locale: 'en' }).url);
  });
});
