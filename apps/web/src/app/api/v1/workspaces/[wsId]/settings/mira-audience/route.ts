import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveWorkspaceRouteAccess } from '@/lib/workspace-route-access';

/**
 * Workspace settings managers may read the Meet Mira 18+ declaration. Only
 * the workspace owner may change it. The server records the authenticated
 * caller and the server time.
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

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;

async function readOwner(db: AdminClient, wsId: string) {
  const { data, error } = await db
    .from('workspaces')
    .select('creator_id, deleted')
    .eq('id', wsId)
    .maybeSingle();
  if (error) throw new Error('Mira workspace owner lookup failed');
  return data?.deleted !== true ? (data?.creator_id ?? null) : null;
}

async function current(db: AdminClient, wsId: string) {
  const [attestation, ownerId] = await Promise.all([
    db
      .schema('private')
      .from(TABLE)
      .select('audience, attested_by, attested_at')
      .eq('ws_id', wsId)
      .maybeSingle(),
    readOwner(db, wsId),
  ]);
  if (attestation.error) throw new Error('Mira audience setting lookup failed');
  const row = attestation.data;
  return row?.attested_by && row.attested_by === ownerId ? row : null;
}

function view(
  row: Awaited<ReturnType<typeof current>>,
  userId: string | undefined
) {
  const attested = !!row && row.audience === 'adults-only';
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
    const db = await createAdminClient({ noCookie: true });
    return NextResponse.json(
      view(await current(db, result.permissions.wsId), result.user?.id)
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
  const wsId = result.permissions.wsId;
  try {
    const db = await createAdminClient({ noCookie: true });
    if ((await readOwner(db, wsId)) !== userId)
      return NextResponse.json(
        { message: 'Workspace owner permission required' },
        { status: 403 }
      );
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
    const { error } = parsed.data.attested
      ? await db.schema('private').from(TABLE).upsert(
          {
            ws_id: wsId,
            audience: 'adults-only',
            attested_by: userId,
            // Re-attesting records the current owner and a fresh time.
            attested_at: new Date().toISOString(),
          },
          { onConflict: 'ws_id' }
        )
      : await db.schema('private').from(TABLE).delete().eq('ws_id', wsId);
    if (error) throw new Error('Mira audience setting write failed');
    return NextResponse.json(view(await current(db, wsId), userId));
  } catch (error) {
    console.error('Failed to update Mira audience attestation', error);
    return NextResponse.json(
      { message: 'Mira audience setting could not be saved' },
      { status: 500 }
    );
  }
}
