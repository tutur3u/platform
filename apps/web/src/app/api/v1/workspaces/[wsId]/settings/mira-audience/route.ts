import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveWorkspaceRouteAccess } from '@/lib/workspace-route-access';

/**
 * Meet Mira 18+ audience attestation. Only workspace settings managers may read
 * or change it. The actor and time are always the authenticated caller and the
 * server clock; the request body carries only the requested state.
 */
interface Params {
  params: Promise<{ wsId: string }>;
}

const TABLE = 'workspace_mira_audience_attestations';
const body = z.object({ attested: z.boolean() }).strict();

async function access(req: Request, params: Params['params']) {
  const { wsId } = await params;
  return resolveWorkspaceRouteAccess(req, wsId, ['manage_workspace_settings']);
}

async function current(wsId: string) {
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db
    .schema('private')
    .from(TABLE)
    .select('ws_id, audience, attested_by, attested_at')
    .eq('ws_id', wsId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function view(
  row: Awaited<ReturnType<typeof current>>,
  userId: string | undefined
) {
  const attested = !!row?.attested_by && row.audience === 'adults-only';
  return {
    attested,
    attestedAt: attested ? row!.attested_at : null,
    attestedByCurrentUser: attested && row!.attested_by === userId,
  };
}

export async function GET(req: Request, { params }: Params) {
  await connection();
  const result = await access(req, params);
  if (!result.ok) return result.response;
  try {
    return NextResponse.json(
      view(await current(result.permissions.wsId), result.user?.id)
    );
  } catch (error) {
    console.error('Failed to read Mira audience attestation', error);
    return NextResponse.json(
      { message: 'Mira audience setting is unavailable' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request, { params }: Params) {
  const result = await access(req, params);
  if (!result.ok) return result.response;
  const userId = result.user?.id;
  if (!userId)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
  const wsId = result.permissions.wsId;
  try {
    const db = await createAdminClient({ noCookie: true });
    const { error } = parsed.data.attested
      ? await db.schema('private').from(TABLE).upsert(
          {
            ws_id: wsId,
            audience: 'adults-only',
            attested_by: userId,
            // Re-attesting records the current manager and a fresh time.
            attested_at: new Date().toISOString(),
          },
          { onConflict: 'ws_id' }
        )
      : await db.schema('private').from(TABLE).delete().eq('ws_id', wsId);
    if (error) throw error;
    return NextResponse.json(view(await current(wsId), userId));
  } catch (error) {
    console.error('Failed to update Mira audience attestation', error);
    return NextResponse.json(
      { message: 'Mira audience setting could not be saved' },
      { status: 500 }
    );
  }
}
