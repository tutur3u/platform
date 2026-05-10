import { google } from '@ai-sdk/google';
import { generateObject } from '@tuturuuu/ai/core';
import type { Json } from '@tuturuuu/types/db';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  hiveNpcRunSchema,
  mapHiveEvent,
  requireHiveAccess,
  serverLogger,
  withHiveRoute,
} from '../../../../../_shared';

type RouteContext = {
  params: Promise<{
    npcId: string;
    serverId: string;
  }>;
};

type HiveDecision = {
  action: {
    target?: { x: number; y: number; z: number };
    type: 'idle' | 'move' | 'speak' | 'work';
  };
  intent: string;
  memoryWrites: string[];
  rationale: string;
  spokenText: string;
};

const hiveDecisionSchema = z.object({
  action: z.object({
    target: z
      .object({
        x: z.number(),
        y: z.number(),
        z: z.number(),
      })
      .optional(),
    type: z.enum(['idle', 'move', 'speak', 'work']),
  }),
  intent: z.string(),
  memoryWrites: z.array(z.string()).default([]),
  rationale: z.string(),
  spokenText: z.string(),
});

function getNearbyEntities(
  world: ReturnType<typeof hiveNpcRunSchema.parse>['world'],
  position: { x: number; y: number; z: number }
) {
  const distance = (target: { x: number; y: number; z: number }) =>
    Math.abs(target.x - position.x) +
    Math.abs(target.y - position.y) +
    Math.abs(target.z - position.z);

  return {
    blocks: world.blocks.filter((block) => distance(block.position) <= 4),
    objects: world.objects.filter((object) => distance(object.position) <= 5),
  };
}

function buildResearchDecision(args: {
  memories: Array<{ content: string; importance: number }>;
  npc: {
    backstory: string | null;
    backstory_enabled: boolean | null;
    memory_enabled: boolean | null;
    name: string;
    position: Json;
    role: string;
    system_prompt: string | null;
  };
  promptMode: 'custom' | 'default' | 'enhanced';
  world: ReturnType<typeof hiveNpcRunSchema.parse>['world'];
}): HiveDecision {
  const npcPosition =
    typeof args.npc.position === 'object' &&
    !Array.isArray(args.npc.position) &&
    args.npc.position &&
    'x' in args.npc.position
      ? (args.npc.position as { x: number; y: number; z: number })
      : { x: 0, y: 1, z: 0 };
  const nearby = getNearbyEntities(args.world, npcPosition);
  const firstObject = nearby.objects[0];
  const nextTarget = firstObject?.position ?? {
    x: npcPosition.x + 1,
    y: npcPosition.y,
    z: npcPosition.z,
  };
  const memoryLine =
    args.npc.memory_enabled && args.memories.length > 0
      ? ` I remember ${args.memories[0]?.content.toLowerCase()}.`
      : '';
  const backstoryLine =
    args.npc.backstory_enabled && args.npc.backstory
      ? ` My background says ${args.npc.backstory.slice(0, 140)}`
      : '';

  return {
    action: {
      target: nextTarget,
      type: firstObject ? 'work' : 'move',
    },
    intent:
      args.promptMode === 'custom' && args.npc.system_prompt
        ? 'Follow the custom research prompt while staying grounded in nearby world state.'
        : 'Inspect the nearest voxel object and keep the shared village simulation coherent.',
    memoryWrites:
      args.npc.memory_enabled && firstObject
        ? [
            `${args.npc.name} inspected ${firstObject.type} near ${firstObject.position.x},${firstObject.position.z}.`,
          ]
        : [],
    rationale: [
      `Role: ${args.npc.role}.`,
      `Nearby blocks: ${nearby.blocks.length}.`,
      `Nearby objects: ${nearby.objects.length}.`,
      backstoryLine,
      memoryLine,
    ]
      .filter(Boolean)
      .join(' '),
    spokenText: `I will ${firstObject ? `check the ${firstObject.type}` : 'walk to the next open tile'} and report what changes in the settlement.`,
  };
}

async function generateHiveDecision(args: {
  fallbackDecision: HiveDecision;
  inputContext: Record<string, unknown>;
  model: string;
  promptMode: 'custom' | 'default' | 'enhanced';
  systemPrompt?: string | null;
}) {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return args.fallbackDecision;
  }

  try {
    const modelId = args.model.split('/').at(-1) || 'gemini-2.5-flash-lite';
    const result = await generateObject({
      model: google(modelId),
      prompt: [
        args.systemPrompt ||
          'You are a Hive NPC decision model. Return one grounded action for the current voxel simulation state.',
        `Prompt mode: ${args.promptMode}`,
        `Context JSON: ${JSON.stringify(args.inputContext)}`,
      ].join('\n\n'),
      schema: hiveDecisionSchema,
    });

    return result.object;
  } catch (error) {
    serverLogger.warn('Hive NPC AI decision generation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return args.fallbackDecision;
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { npcId, serverId } = await context.params;

  return withHiveRoute(
    request,
    '/api/v1/hive/servers/[serverId]/npcs/[npcId]/run',
    async () => {
      const access = await requireHiveAccess(request);

      if (!access.ok) {
        return access.response;
      }

      const payload = hiveNpcRunSchema.parse(await request.json());
      const { data: npc, error: npcError } = await access.access.sbAdmin
        .from('hive_npcs')
        .select('*')
        .eq('id', npcId)
        .eq('server_id', serverId)
        .maybeSingle();

      if (npcError || !npc) {
        return NextResponse.json({ error: 'NPC not found' }, { status: 404 });
      }

      const { data: state } = await access.access.sbAdmin
        .from('hive_world_states')
        .select('revision')
        .eq('server_id', serverId)
        .maybeSingle();

      if (Number(state?.revision ?? 0) !== payload.expectedRevision) {
        return NextResponse.json(
          { error: 'Hive revision conflict' },
          { status: 409 }
        );
      }

      const { data: memories, error: memoriesError } =
        await access.access.sbAdmin
          .from('hive_npc_memories')
          .select('content, importance')
          .eq('npc_id', npcId)
          .eq('enabled', true)
          .order('importance', { ascending: false })
          .limit(12);

      if (memoriesError) {
        serverLogger.warn('Failed to load Hive NPC memories', {
          error: memoriesError.message,
          npcId,
          serverId,
        });
      }

      const fallbackDecision = buildResearchDecision({
        memories: memories ?? [],
        npc,
        promptMode: payload.promptMode,
        world: payload.world,
      });
      const inputContext = {
        activeMemories: memories ?? [],
        npc: {
          backstory: npc.backstory_enabled ? npc.backstory : null,
          name: npc.name,
          position: npc.position,
          role: npc.role,
          systemPrompt:
            payload.promptMode === 'custom' && npc.custom_prompt_enabled
              ? npc.system_prompt
              : null,
        },
        promptMode: payload.promptMode,
        world: payload.world,
      };
      const decision = await generateHiveDecision({
        fallbackDecision,
        inputContext,
        model: npc.model,
        promptMode: payload.promptMode,
        systemPrompt:
          payload.promptMode === 'custom' && npc.custom_prompt_enabled
            ? npc.system_prompt
            : null,
      });

      const { data: run, error: runError } = await access.access.sbAdmin
        .from('hive_npc_runs')
        .insert({
          actor_user_id: access.access.user.id,
          input_context: inputContext,
          npc_id: npcId,
          output_decision: decision,
          prompt_mode: payload.promptMode,
          server_id: serverId,
        })
        .select('id, npc_id, input_context, output_decision, created_at')
        .single();

      if (runError) {
        return NextResponse.json(
          { error: 'Failed to persist Hive NPC run' },
          { status: 500 }
        );
      }

      for (const content of decision.memoryWrites) {
        await access.access.sbAdmin.from('hive_npc_memories').insert({
          content,
          created_by: access.access.user.id,
          importance: 3,
          npc_id: npcId,
          server_id: serverId,
          source_run_id: run.id,
        });
      }

      const { data: event, error: eventError } =
        await access.access.sbAdmin.rpc('apply_hive_world_event', {
          p_actor_user_id: access.access.user.id,
          p_event_type: 'npc.decision',
          p_expected_revision: payload.expectedRevision,
          p_payload: {
            decision,
            npcId,
            runId: run.id,
          } as Json,
          p_server_id: serverId,
          p_world_data: payload.world as Json,
        });

      const eventRow = event?.[0];

      if (eventError || !eventRow) {
        return NextResponse.json(
          { error: 'Failed to append Hive NPC event' },
          { status: 409 }
        );
      }

      return NextResponse.json({
        event: mapHiveEvent(eventRow),
        run: {
          createdAt: run.created_at,
          id: run.id,
          inputContext: run.input_context,
          npcId: run.npc_id,
          outputDecision: run.output_decision,
        },
      });
    }
  );
}
