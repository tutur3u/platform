import { createHash, timingSafeEqual } from 'node:crypto';

// Match the server-side cron gateway convention: compare fixed-size digests.
export function authorizeInfrastructureCron(request: Request): Response | null {
  if (request.method !== 'GET') {
    return Response.json(
      { ok: false },
      {
        status: 405,
        headers: { Allow: 'GET', 'Cache-Control': 'private, no-store' },
      }
    );
  }

  const secret =
    process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';
  const authorization = request.headers.get('authorization') ?? '';
  const bearer = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/i.exec(authorization);
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (
    !secret ||
    !bearer ||
    !timingSafeEqual(digest(bearer[1] ?? ''), digest(secret))
  ) {
    return Response.json(
      { ok: false },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
  return null;
}
