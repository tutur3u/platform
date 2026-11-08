import type { RateLimit } from '@cloudflare/workers-types';
import { z } from 'zod';
import { readJson } from './http-json';
import { authorizePurge } from './purge-auth';
import { rotateWorkspaceCache } from './workspace-cache';

const bodySchema = z.object({ scope: z.literal('workspace') }).strict();

export async function purgePage({
  request,
  siteId,
  workspaceId,
  origin,
  tokensJson,
  limiter,
  cache,
}: {
  request: Request;
  siteId: string;
  workspaceId: string;
  origin: string;
  tokensJson: string | undefined;
  limiter: RateLimit | undefined;
  cache: Pick<Cache, 'put'>;
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
  const contentType = request.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== 'application/json') return reply(415);
  if (!limiter) return reply(503);
  try {
    if (!(await limiter.limit({ key: `cms-purge:${siteId}` })).success)
      return reply(429);
  } catch {
    return reply(503);
  }
  if (Number(request.headers.get('content-length')) > 4096) return reply(413);
  try {
    bodySchema.parse(await readJson(request, 4096));
  } catch {
    return reply(400);
  }
  try {
    await rotateWorkspaceCache({ origin, site: siteId, workspaceId }, cache);
    return reply(204);
  } catch {
    return reply(503);
  }
}
