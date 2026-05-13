import { type NextRequest, NextResponse } from 'next/server';
import {
  deleteHiveServer,
  getHiveSnapshot,
  toBase64,
  updateHiveServer,
} from '@/lib/hive/hive-db';
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

  const snapshot = await getHiveSnapshot(serverId);
  const { server, state, events, npcs } = snapshot;

  if (!server || (!server.enabled && !result.access.isAdmin)) {
    return NextResponse.json(
      { error: 'Hive server not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    crdt: {
      state: toBase64(state?.crdt_state),
      stateVector: toBase64(state?.crdt_state_vector),
    },
    crops: snapshot.crops,
    economy: {
      totalCurrency: Number(server.total_currency ?? 0),
      inventories: snapshot.inventories,
      warehouses: snapshot.warehouses,
    },
    events: events.map(mapHiveEvent),
    npcs: npcs.map(mapHiveNpc),
    revision: Number(state?.revision ?? state?.op_seq ?? 0),
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

  const server = await updateHiveServer(serverId, {
    description: parsed.data.description,
    enabled: parsed.data.enabled,
    maxPlayers: parsed.data.maxPlayers,
    name: parsed.data.name,
  });

  if (!server) {
    return NextResponse.json(
      { error: 'Failed to update Hive server' },
      { status: 400 }
    );
  }

  return NextResponse.json({ server: mapHiveServer(server) });
}

async function deleteServer(request: NextRequest, serverId: string) {
  const result = await requireHiveAdmin(request);
  if (!result.ok) return result.response;

  try {
    await deleteHiveServer(serverId);
  } catch {
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
