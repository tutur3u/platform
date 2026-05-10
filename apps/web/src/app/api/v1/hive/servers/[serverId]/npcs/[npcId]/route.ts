import type { Json } from '@tuturuuu/types/db';
import { type NextRequest, NextResponse } from 'next/server';
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

  const { data, error } = await result.access.sbAdmin
    .from('hive_npcs')
    .update({
      ...(parsed.data.backstory !== undefined
        ? { backstory: parsed.data.backstory }
        : {}),
      ...(parsed.data.backstoryEnabled !== undefined
        ? { backstory_enabled: parsed.data.backstoryEnabled }
        : {}),
      ...(parsed.data.customPromptEnabled !== undefined
        ? { custom_prompt_enabled: parsed.data.customPromptEnabled }
        : {}),
      ...(parsed.data.memoryEnabled !== undefined
        ? { memory_enabled: parsed.data.memoryEnabled }
        : {}),
      ...(parsed.data.model !== undefined ? { model: parsed.data.model } : {}),
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.position !== undefined
        ? { position: parsed.data.position as Json }
        : {}),
      ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
      ...(parsed.data.settings !== undefined
        ? { settings: parsed.data.settings as Json }
        : {}),
      ...(parsed.data.systemPrompt !== undefined
        ? { system_prompt: parsed.data.systemPrompt }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', npcId)
    .eq('server_id', serverId)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'Failed to update Hive NPC' },
      { status: 400 }
    );
  }

  return NextResponse.json({ npc: mapHiveNpc(data) });
}

async function deleteNpc(
  request: NextRequest,
  serverId: string,
  npcId: string
) {
  const result = await requireHiveAccess(request);
  if (!result.ok) return result.response;

  const { error } = await result.access.sbAdmin
    .from('hive_npcs')
    .delete()
    .eq('id', npcId)
    .eq('server_id', serverId);

  if (error) {
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
