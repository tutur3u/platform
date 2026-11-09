import { createHash } from 'node:crypto';
import {
  evaluateFlags,
  registry,
  resolveRuntimeFlagEnvironment,
  selectRuntimeOverrides,
} from '@tuturuuu/feature-flags';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { loadMobileRuntimeFlags } from './runtime-store';

const workspaceIdSchema = z.string().uuid();
const cacheHeaders = {
  'Cache-Control': 'private, no-cache',
  Vary: 'Authorization, Cookie',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
};

export async function GET(request: NextRequest) {
  await connection();
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: true,
  });
  if (!auth.ok) {
    for (const [key, value] of Object.entries(cacheHeaders)) {
      auth.response.headers.set(key, value);
    }
    return auth.response;
  }

  const wsId = request.nextUrl.searchParams.get('wsId');
  if (wsId !== null) {
    if (!workspaceIdSchema.safeParse(wsId).success) {
      return NextResponse.json(
        { error: 'Invalid workspace ID' },
        { status: 400, headers: cacheHeaders }
      );
    }
    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: auth.user.id,
      supabase: auth.supabase,
      requiredType: 'ANY',
    });
    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Could not verify access' },
        { status: 500, headers: cacheHeaders }
      );
    }
    if (!membership.ok) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: cacheHeaders }
      );
    }
  }

  const environment = resolveRuntimeFlagEnvironment({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  });
  let store: Awaited<ReturnType<typeof loadMobileRuntimeFlags>>;
  try {
    store = await loadMobileRuntimeFlags(environment);
  } catch {
    store = { status: 'unreachable' };
  }
  const selected = selectRuntimeOverrides({
    keys: registry.map((flag) => flag.key),
    store,
  });
  if (selected.kind === 'denied' || selected.kind === 'invalid') {
    return NextResponse.json(
      { error: 'Could not evaluate flags' },
      { status: 500, headers: cacheHeaders }
    );
  }
  const context = {
    userId: auth.user.id,
    ...(wsId === null ? {} : { wsId }),
  };
  const flags =
    selected.kind === 'overrides' && Object.keys(selected.overrides).length > 0
      ? evaluateFlags(registry, context, selected.overrides)
      : evaluateFlags(registry, context);
  const payload = { ttlSeconds: 30, flags };
  const version = createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
  const etag = `"${version}"`;
  const headers = { ...cacheHeaders, ETag: etag };
  const validators = request.headers.get('if-none-match')?.split(',') ?? [];
  if (
    validators.some((value) => {
      const validator = value.trim();
      const opaque = validator.replace(/^W\//, '');
      // The mobile client echoes the body `version` (bare hex); browsers echo the quoted ETag.
      return validator === '*' || opaque === etag || opaque === version;
    })
  ) {
    return new NextResponse(null, { status: 304, headers });
  }
  return NextResponse.json({ version, ...payload }, { headers });
}
