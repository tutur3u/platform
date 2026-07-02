import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { RATE_LIMIT_SECRET_NAMES } from '@/lib/rate-limit';
import { authorizeAbuseIntelligenceRequest } from '../../abuse-intelligence/_shared';

// App-layer per-workspace rate-limit knobs (enforced by withSessionAuth /
// withApiAuth via getEffectiveRateLimitConfig). The edge READ uplift for a
// workspace is configured separately as a `workspace:<wsId>` rule.
const MANAGED_SECRET_NAMES = Object.values(RATE_LIMIT_SECRET_NAMES);
const MANAGED_SECRET_NAME_SET = new Set<string>(MANAGED_SECRET_NAMES);

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const SaveSecretsSchema = z.object({
  secrets: z.record(
    z.enum(MANAGED_SECRET_NAMES as [string, ...string[]]),
    z.string().trim().max(4096).nullable()
  ),
  wsId: z.string().regex(UUID_PATTERN),
});

export async function GET(request: Request) {
  const authorization = await authorizeAbuseIntelligenceRequest(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  const wsId = new URL(request.url).searchParams.get('wsId')?.trim();
  if (!wsId || !UUID_PATTERN.test(wsId)) {
    return NextResponse.json(
      { message: 'A valid wsId is required' },
      { status: 400 }
    );
  }

  const { data, error } = await authorization.sbAdmin
    .from('workspace_secrets')
    .select('name, value')
    .eq('ws_id', wsId)
    .in('name', MANAGED_SECRET_NAMES);

  if (error) {
    serverLogger.error('Failed to load workspace rate-limit secrets', error);
    return NextResponse.json(
      { message: 'Failed to load workspace rate-limit secrets' },
      { status: 500 }
    );
  }

  const secrets: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.name && row.value != null) {
      secrets[row.name] = row.value;
    }
  }

  return NextResponse.json({
    managedNames: MANAGED_SECRET_NAMES,
    secrets,
    wsId,
  });
}

export async function PUT(request: Request) {
  const authorization = await authorizeAbuseIntelligenceRequest(
    request,
    'manage_workspace_roles'
  );
  if (!authorization.ok) {
    return authorization.response;
  }

  const parsed = SaveSecretsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request data' },
      { status: 400 }
    );
  }

  const { secrets, wsId } = parsed.data;
  const { sbAdmin } = authorization;

  // workspace_secrets has no (ws_id, name) unique constraint, so reconcile by id.
  const { data: existingRows, error: loadError } = await sbAdmin
    .from('workspace_secrets')
    .select('id, name, value')
    .eq('ws_id', wsId)
    .in('name', MANAGED_SECRET_NAMES);

  if (loadError) {
    serverLogger.error(
      'Failed to load workspace secrets for update',
      loadError
    );
    return NextResponse.json(
      { message: 'Failed to update workspace rate-limit secrets' },
      { status: 500 }
    );
  }

  const existingByName = new Map(
    (existingRows ?? []).map((row) => [row.name, row])
  );

  for (const [name, rawValue] of Object.entries(secrets)) {
    if (!MANAGED_SECRET_NAME_SET.has(name)) {
      continue;
    }
    const value = rawValue?.trim() ? rawValue.trim() : null;
    const existing = existingByName.get(name);

    let mutationError: { message: string } | null = null;
    if (value === null) {
      if (existing) {
        ({ error: mutationError } = await sbAdmin
          .from('workspace_secrets')
          .delete()
          .eq('id', existing.id));
      }
    } else if (existing) {
      ({ error: mutationError } = await sbAdmin
        .from('workspace_secrets')
        .update({ value })
        .eq('id', existing.id));
    } else {
      ({ error: mutationError } = await sbAdmin
        .from('workspace_secrets')
        .insert({ name, value, ws_id: wsId }));
    }

    if (mutationError) {
      serverLogger.error('Failed to persist workspace rate-limit secret', {
        message: mutationError.message,
        name,
        wsId,
      });
      return NextResponse.json(
        { message: 'Failed to update workspace rate-limit secrets' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, wsId });
}
