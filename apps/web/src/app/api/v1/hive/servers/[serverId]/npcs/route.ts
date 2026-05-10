import type { Json } from '@tuturuuu/types/db';
import { type NextRequest, NextResponse } from 'next/server';
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

  const { data, error } = await result.access.sbAdmin
    .from('hive_npcs')
    .insert({
      backstory: parsed.data.backstory,
      backstory_enabled: parsed.data.backstoryEnabled,
      created_by: result.access.user.id,
      custom_prompt_enabled: parsed.data.customPromptEnabled,
      memory_enabled: parsed.data.memoryEnabled,
      model: parsed.data.model,
      name: parsed.data.name,
      position: parsed.data.position as Json,
      role: parsed.data.role,
      server_id: serverId,
      settings: parsed.data.settings as Json,
      system_prompt: parsed.data.systemPrompt,
    })
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'Failed to create Hive NPC' },
      { status: 400 }
    );
  }

  return NextResponse.json({ npc: mapHiveNpc(data) }, { status: 201 });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { serverId } = await params;
  return withHiveRoute(request, ROUTE, () => createNpc(request, serverId));
}
