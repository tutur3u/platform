import { type NextRequest, NextResponse } from 'next/server';
import {
  hiveServerSchema,
  mapHiveServer,
  requireHiveAccess,
  requireHiveAdmin,
  slugifyHiveServerName,
  withHiveRoute,
} from '../_shared';

const ROUTE = '/api/v1/hive/servers';

async function listServers(request: NextRequest) {
  const result = await requireHiveAccess(request);
  if (!result.ok) return result.response;

  let query = result.access.sbAdmin
    .from('hive_servers')
    .select('*')
    .order('created_at', { ascending: true });

  if (!result.access.isAdmin) {
    query = query.eq('enabled', true);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: 'Failed to list Hive servers' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    isAdmin: result.access.isAdmin,
    servers: (data ?? []).map(mapHiveServer),
  });
}

async function createServer(request: NextRequest) {
  const result = await requireHiveAdmin(request);
  if (!result.ok) return result.response;

  const body = await request.json().catch(() => null);
  const parsed = hiveServerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid Hive server payload' },
      { status: 400 }
    );
  }

  const slug = slugifyHiveServerName(parsed.data.name);
  const { data, error } = await result.access.sbAdmin
    .from('hive_servers')
    .insert({
      created_by: result.access.user.id,
      description: parsed.data.description ?? null,
      enabled: parsed.data.enabled,
      max_players: parsed.data.maxPlayers,
      name: parsed.data.name,
      slug,
    })
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'Failed to create Hive server' },
      { status: 400 }
    );
  }

  await result.access.sbAdmin.from('hive_world_states').insert({
    server_id: data.id,
    world_data: { blocks: [], objects: [] },
  });

  return NextResponse.json({ server: mapHiveServer(data) }, { status: 201 });
}

export async function GET(request: NextRequest) {
  return withHiveRoute(request, ROUTE, () => listServers(request));
}

export async function POST(request: NextRequest) {
  return withHiveRoute(request, ROUTE, () => createServer(request));
}
