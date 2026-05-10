import { type NextRequest, NextResponse } from 'next/server';
import {
  hiveServerSchema,
  mapHiveEvent,
  mapHiveNpc,
  mapHiveServer,
  requireHiveAccess,
  requireHiveAdmin,
  withHiveRoute,
} from '../../_shared';

const ROUTE = '/api/v1/hive/servers/[serverId]';

type Params = {
  params: Promise<{
    serverId: string;
  }>;
};

async function getSnapshot(request: NextRequest, serverId: string) {
  const result = await requireHiveAccess(request);
  if (!result.ok) return result.response;

  const sbAdmin = result.access.sbAdmin;
  const [{ data: server }, { data: state }, { data: events }, { data: npcs }] =
    await Promise.all([
      sbAdmin.from('hive_servers').select('*').eq('id', serverId).maybeSingle(),
      sbAdmin
        .from('hive_world_states')
        .select('*')
        .eq('server_id', serverId)
        .maybeSingle(),
      sbAdmin
        .from('hive_world_events')
        .select('*')
        .eq('server_id', serverId)
        .order('revision', { ascending: false })
        .limit(100),
      sbAdmin
        .from('hive_npcs')
        .select('*')
        .eq('server_id', serverId)
        .order('created_at', { ascending: true }),
    ]);

  if (!server || (!server.enabled && !result.access.isAdmin)) {
    return NextResponse.json(
      { error: 'Hive server not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    events: (events ?? []).reverse().map(mapHiveEvent),
    npcs: (npcs ?? []).map(mapHiveNpc),
    revision: Number(state?.revision ?? 0),
    server: mapHiveServer(server),
    world: state?.world_data ?? { blocks: [], objects: [] },
  });
}

async function updateServer(request: NextRequest, serverId: string) {
  const result = await requireHiveAdmin(request);
  if (!result.ok) return result.response;

  const body = await request.json().catch(() => null);
  const parsed = hiveServerSchema.partial().safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid Hive server payload' },
      { status: 400 }
    );
  }

  const { data, error } = await result.access.sbAdmin
    .from('hive_servers')
    .update({
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
      ...(parsed.data.enabled !== undefined
        ? { enabled: parsed.data.enabled }
        : {}),
      ...(parsed.data.maxPlayers !== undefined
        ? { max_players: parsed.data.maxPlayers }
        : {}),
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', serverId)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'Failed to update Hive server' },
      { status: 400 }
    );
  }

  return NextResponse.json({ server: mapHiveServer(data) });
}

async function deleteServer(request: NextRequest, serverId: string) {
  const result = await requireHiveAdmin(request);
  if (!result.ok) return result.response;

  const { error } = await result.access.sbAdmin
    .from('hive_servers')
    .delete()
    .eq('id', serverId);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to delete Hive server' },
      { status: 400 }
    );
  }

  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest, { params }: Params) {
  const { serverId } = await params;
  return withHiveRoute(request, ROUTE, () => getSnapshot(request, serverId));
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { serverId } = await params;
  return withHiveRoute(request, ROUTE, () => updateServer(request, serverId));
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { serverId } = await params;
  return withHiveRoute(request, ROUTE, () => deleteServer(request, serverId));
}
