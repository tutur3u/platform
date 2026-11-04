import { z } from 'zod';
import { parseCmsPageVersion } from '@tuturuuu/cms-blocks/schema';

const tokensSchema = z.object({
  foreground: z.string().regex(/^#[0-9a-f]{6}$/i).default('#171717'),
  background: z.string().regex(/^#[0-9a-f]{6}$/i).default('#ffffff'),
  font: z.enum(['sans-serif', 'serif', 'monospace']).default('sans-serif'),
});
const siteSchema = z.object({
  id: z.string().min(1), workspaceId: z.string().uuid(),
  defaultLocale: z.string().min(2).max(10), tokens: tokensSchema.default({ foreground: '#171717', background: '#ffffff', font: 'sans-serif' }),
});
const sitesSchema = z.record(z.string(), siteSchema);
const deliverySchema = z.object({
  collections: z.array(z.object({ entries: z.array(z.object({
    slug: z.string(), title: z.string(),
    metadata: z.object({ description: z.string().optional(), ogImage: z.string().url().optional() }).passthrough().nullish(),
    publishedPageVersion: z.object({ id: z.string(), schema_version: z.number(), blocks: z.unknown() }).nullish(),
  })) })),
});
export type PublishedPage = {
  page: NonNullable<ReturnType<typeof parseCmsPageVersion>>;
  locale: string; title: string; description?: string; ogImage?: string;
  tokens: z.infer<typeof tokensSchema>;
};
export type Environment = { CMS_SITES?: string; CMS_DELIVERY_ORIGIN?: string; CMS_PURGE_TOKEN?: string; ASSETS?: { fetch: typeof fetch } };
type Dependencies = { fetch: typeof fetch; cache: Pick<Cache, 'match' | 'put' | 'delete'>; render: (request: Request, page: PublishedPage) => Promise<Response> };

export function cacheRequest({ origin, site, path, locale, version }: { origin: string; site: string; path: string; locale: string; version: string }) {
  const key = new URL('/__cms/cache', origin);
  key.search = new URLSearchParams({ site, path, locale, version }).toString();
  return new Request(key);
}

export async function serve(request: Request, env: Environment, deps: Dependencies): Promise<Response> {
  const url = new URL(request.url);
  const fail = (status: number) => new Response(status === 404 ? 'Page not found' : 'Site unavailable', { status, headers: { 'Cache-Control': 'no-store' } });
  let sites: z.infer<typeof sitesSchema>;
  try { sites = sitesSchema.parse(JSON.parse(env.CMS_SITES ?? '{}')); } catch { return fail(503); }
  const site = sites[url.hostname.toLowerCase()];
  if (!site) return fail(404);
  if (url.pathname.startsWith('/__cms/cache')) return fail(404);
  if (url.pathname === '/__cms/purge') {
    if (!env.CMS_PURGE_TOKEN || request.headers.get('authorization') !== `Bearer ${env.CMS_PURGE_TOKEN}`) return fail(403);
    if (request.method !== 'POST') return fail(405);
    if (Number(request.headers.get('content-length')) > 4096) return fail(413);
    try {
      const body = z.object({ path: z.string().max(2048).startsWith('/'), locale: z.string().max(10), version: z.string().max(128) }).parse(await readJson(request, 4096));
      await deps.cache.delete(cacheRequest({ origin: url.origin, site: site.id, ...body }));
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    } catch { return fail(400); }
  }
  if (!['GET', 'HEAD'].includes(request.method)) return fail(405);
  // Static assets are served by the Worker asset binding after an admitted host.
  if (url.pathname.startsWith('/assets/')) return env.ASSETS ? env.ASSETS.fetch(request) : fail(404);
  try {
    const origin = new URL(env.CMS_DELIVERY_ORIGIN ?? '');
    if (origin.protocol !== 'https:') return fail(503);
    const deliveryUrl = new URL(`/api/v1/workspaces/${site.workspaceId}/external-projects/delivery`, origin);
    const delivery = await deps.fetch(deliveryUrl, { signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!delivery.ok) return fail(503);
    const payload = deliverySchema.parse(await readJson(delivery, 4 * 1024 * 1024));
    const path = url.pathname.replace(/\/$/, '') || '/';
    const slug = path === '/' ? 'home' : path.slice(1);
    const entry = payload.collections.flatMap((collection) => collection.entries).find((entry) => entry.slug === slug);
    const version = entry?.publishedPageVersion;
    if (!entry || !version) return fail(404);
    const page = parseCmsPageVersion({ data: version.blocks, schema_version: version.schema_version });
    if (!page) return fail(503);
    const locale = /^\/en(?:\/|$)/.test(path) ? 'en' : site.defaultLocale;
    const key = cacheRequest({ origin: url.origin, site: site.id, path, locale, version: version.id });
    const hit = await deps.cache.match(key);
    if (hit) return request.method === 'HEAD' ? new Response(null, hit) : hit;
    const result = await deps.render(request, { page, locale, tokens: site.tokens, title: entry.title, description: entry.metadata?.description, ogImage: entry.metadata?.ogImage });
    const response = new Response(result.body, result);
    response.headers.set('Cache-Control', 'public, max-age=0, s-maxage=30');
    response.headers.set('Content-Language', locale);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    if (response.ok && !response.headers.has('set-cookie')) await deps.cache.put(key, response.clone());
    return request.method === 'HEAD' ? new Response(null, response) : response;
  } catch { return fail(503); }
}

async function readJson(input: Request | Response, limit: number): Promise<unknown> {
  const reader = input.body?.getReader();
  if (!reader) throw new Error('Missing JSON');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error('JSON exceeds limit');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
