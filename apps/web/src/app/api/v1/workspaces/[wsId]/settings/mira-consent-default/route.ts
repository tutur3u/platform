import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveWorkspaceRouteAccess } from '@/lib/workspace-route-access';

/**
 * Workspace default for the Meet room Mira consent tick box. Only workspace
 * settings managers may read or change it. Every change appends an audit row
 * with the authenticated caller and the server clock; the latest row wins and
 * no row means ticked. It applies to joins after the change.
 */
interface Params {
  params: Promise<{ wsId: string }>;
}

const TABLE = 'workspace_mira_consent_defaults';
const body = z.object({ boxTickedByDefault: z.boolean() }).strict();

async function access(req: Request, params: Params['params']) {
  const { wsId } = await params;
  return resolveWorkspaceRouteAccess(req, wsId, ['manage_workspace_settings']);
}

async function current(wsId: string) {
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db
    .schema('private')
    .from(TABLE)
    .select('box_ticked, created_at')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return {
    boxTickedByDefault: data?.box_ticked ?? true,
    changedAt: data?.created_at ?? null,
  };
}

export async function GET(req: Request, { params }: Params) {
  await connection();
  const result = await access(req, params);
  if (!result.ok) return result.response;
  try {
    return NextResponse.json(await current(result.permissions.wsId));
  } catch (error) {
    console.error('Failed to read Mira consent default', error);
    return NextResponse.json(
      { message: 'Mira consent setting is unavailable' },
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
    const { error } = await db.schema('private').from(TABLE).insert({
      ws_id: wsId,
      box_ticked: parsed.data.boxTickedByDefault,
      changed_by: userId,
    });
    if (error) throw error;
    return NextResponse.json(await current(wsId));
  } catch (error) {
    console.error('Failed to update Mira consent default', error);
    return NextResponse.json(
      { message: 'Mira consent setting could not be saved' },
      { status: 500 }
    );
  }
}
