import { type NextRequest, NextResponse } from 'next/server';
import { deleteHiveNpc, updateHiveNpc } from '@/lib/hive/npcs';
import {
  hiveNpcSchema,
  mapHiveNpc,
  requireHiveAccess,
  withHiveRoute,
} from '../../../../_shared';

const ROUTE = '/api/v1/hive/servers/[serverId]/npcs/[npcId]';

type Params = {
  params: Promise<{
    npcId: string;
    serverId: string;
  }>;
};

async function updateNpc(
  request: NextRequest,
  serverId: string,
  npcId: string
) {
  const result = await requireHiveAccess(request);
  if (!result.ok) return result.response;

  const body = await request.json().catch(() => null);
  const parsed = hiveNpcSchema.partial().safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid Hive NPC payload' },
      { status: 400 }
    );
  }

  const npc = await updateHiveNpc({
    npcId,
    patch: parsed.data,
    serverId,
  });

  if (!npc) {
    return NextResponse.json(
      { error: 'Failed to update Hive NPC' },
      { status: 400 }
    );
  }

  return NextResponse.json({ npc: mapHiveNpc(npc) });
}

async function deleteNpc(
  request: NextRequest,
  serverId: string,
  npcId: string
) {
  const result = await requireHiveAccess(request);
  if (!result.ok) return result.response;

  try {
    await deleteHiveNpc({ npcId, serverId });
  } catch {
    return NextResponse.json(
      { error: 'Failed to delete Hive NPC' },
      { status: 400 }
    );
  }

  return new NextResponse(null, { status: 204 });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { npcId, serverId } = await params;
  return withHiveRoute(request, ROUTE, () =>
    updateNpc(request, serverId, npcId)
  );
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { npcId, serverId } = await params;
  return withHiveRoute(request, ROUTE, () =>
    deleteNpc(request, serverId, npcId)
  );
}
