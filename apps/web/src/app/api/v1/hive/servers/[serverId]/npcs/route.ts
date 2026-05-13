import { type NextRequest, NextResponse } from 'next/server';
import { createHiveNpc } from '@/lib/hive/npcs';
import {
  hiveNpcSchema,
  mapHiveNpc,
  requireHiveAccess,
  withHiveRoute,
} from '../../../_shared';

const ROUTE = '/api/v1/hive/servers/[serverId]/npcs';

type Params = {
  params: Promise<{
    serverId: string;
  }>;
};

async function createNpc(request: NextRequest, serverId: string) {
  const result = await requireHiveAccess(request);
  if (!result.ok) return result.response;

  const body = await request.json().catch(() => null);
  const parsed = hiveNpcSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid Hive NPC payload' },
      { status: 400 }
    );
  }

  const npc = await createHiveNpc({
    createdBy: result.access.user.id,
    npc: parsed.data,
    serverId,
  });

  if (!npc) {
    return NextResponse.json(
      { error: 'Failed to create Hive NPC' },
      { status: 400 }
    );
  }

  return NextResponse.json({ npc: mapHiveNpc(npc) }, { status: 201 });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { serverId } = await params;
  return withHiveRoute(request, ROUTE, () => createNpc(request, serverId));
}
