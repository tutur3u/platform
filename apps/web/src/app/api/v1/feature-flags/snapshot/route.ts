import { createHash, timingSafeEqual } from 'node:crypto';
import { connection } from 'next/server';
import { loadPlatformFeatureFlagSnapshot } from '@/lib/feature-flags/server';

const headers = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization',
};

function sha256(value: string) {
  return createHash('sha256').update(value).digest();
}

export async function GET(request: Request) {
  await connection();

  const expected = process.env.FEATURE_FLAGS_SNAPSHOT_TOKEN;
  if (!expected) {
    return Response.json(
      { error: 'snapshot_unavailable' },
      { status: 503, headers }
    );
  }
  const token = /^Bearer (\S+)$/i.exec(
    request.headers.get('authorization') ?? ''
  )?.[1];
  if (!token || !timingSafeEqual(sha256(token), sha256(expected))) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  }

  const environments = new URL(request.url).searchParams.getAll('environment');
  const [environment] = environments;
  if (
    environments.length !== 1 ||
    (environment !== 'production' && environment !== 'development')
  ) {
    return Response.json(
      { error: 'invalid_environment' },
      { status: 400, headers }
    );
  }

  const result = await loadPlatformFeatureFlagSnapshot(environment);
  if (result.status !== 'ready') {
    return Response.json(
      { error: 'snapshot_unavailable' },
      { status: 503, headers }
    );
  }

  const body = JSON.stringify(result.snapshot);
  const etag = `"${sha256(body).toString('hex')}"`;
  const validators = request.headers.get('if-none-match')?.split(',') ?? [];
  const responseHeaders = { ...headers, ETag: etag };
  if (
    validators.some((candidate) => {
      const validator = candidate.trim();
      return validator === '*' || validator.replace(/^W\//, '') === etag;
    })
  ) {
    return new Response(null, { status: 304, headers: responseHeaders });
  }

  return new Response(body, {
    headers: { ...responseHeaders, 'Content-Type': 'application/json' },
  });
}
