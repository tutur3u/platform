import type { RateLimit } from '@cloudflare/workers-types';
import { z } from 'zod';
import { cacheRequest } from './cache-key';
import { readJson } from './http-json';
import { authorizePurge } from './purge-auth';

const bodySchema = z.object({
  path: z
    .string()
    .max(2048)
    .startsWith('/')
    .refine((path) => {
      if (
        (path !== '/' && path.endsWith('/')) ||
        path.startsWith('//') ||
        /[\\?#]/.test(path)
      )
        return false;
      for (const char of path)
        if ((char.codePointAt(0) ?? 0) <= 0x20) return false;
      return new URL(path, 'https://cms.invalid').pathname === path;
    }),
  locale: z.string().min(2).max(10),
  version: z.uuid(),
});

export async function purgePage({
  request,
  siteId,
  origin,
  tokensJson,
  limiter,
  cache,
}: {
  request: Request;
  siteId: string;
  origin: string;
  tokensJson: string | undefined;
  limiter: RateLimit | undefined;
  cache: Pick<Cache, 'delete'>;
}): Promise<Response> {
  const reply = (status: number) =>
    new Response(null, {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...(status === 429 ? { 'Retry-After': '60' } : {}),
      },
    });
  if (
    !authorizePurge({
      header: request.headers.get('authorization'),
      siteId,
      tokensJson,
    })
  )
    return reply(401);
  if (request.method !== 'POST') return reply(405);
  if (!limiter) return reply(503);
  try {
    if (!(await limiter.limit({ key: `cms-purge:${siteId}` })).success)
      return reply(429);
  } catch {
    return reply(503);
  }
  if (Number(request.headers.get('content-length')) > 4096) return reply(413);
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await readJson(request, 4096));
  } catch {
    return reply(400);
  }
  try {
    await cache.delete(cacheRequest({ origin, site: siteId, ...body }));
    return reply(204);
  } catch {
    return reply(503);
  }
}
