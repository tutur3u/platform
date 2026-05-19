import { google } from '@ai-sdk/google';
import { generateObject } from '@tuturuuu/ai/core';
import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import { toBareModelName } from '@tuturuuu/ai/credits/model-mapping';
import type { Json } from '@tuturuuu/types/db';
import { z } from 'zod';
import { serverLogger } from '../infrastructure/log-drain';
import {
  HiveAiAccessError,
  type HiveCreditSource,
  resolveHiveAllowedModel,
  resolveHiveCreditContext,
} from './ai';
import { createHiveWorldEvent } from './hive-db';
import {
  appendHiveNpcMemories,
  getHiveNpc,
  listHiveNpcMemories,
  persistHiveNpcRun,
} from './npcs';
import {
  ensureHiveResearchSchema,
  resolveHiveResearchSessionId,
} from './research-schema';
import type { HiveNpcRow, HiveNpcRunRow, HiveWorld } from './types';

type HiveNpcTrigger =
  | 'autonomous'
  | 'cron'
  | 'manual'
  | 'simulation'
  | 'workflow';

type HiveInteractionTurn = {
  action: {
    target?: { x: number; y: number; z: number };
    type: 'idle' | 'move' | 'speak' | 'work';
  };
  intent: string;
  memoryWrites: string[];
  rationale: string;
  speakerNpcId: string;
  spokenText: string;
  targetNpcId: string | null;
};

type HiveConversation = {
  summary: string;
  turns: HiveInteractionTurn[];
  worldImpact: string;
};

const hiveInteractionTurnSchema = z.object({
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
  speakerNpcId: z.string(),
  spokenText: z.string(),
  targetNpcId: z.string().nullable().default(null),
});

const hiveConversationSchema = z.object({
  summary: z.string(),
  turns: z.array(hiveInteractionTurnSchema).min(1).max(12),
  worldImpact: z.string(),
});

function asVector(value: Json): { x: number; y: number; z: number } {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.z === 'number'
  ) {
    return { x: value.x, y: value.y, z: value.z };
  }

  return { x: 0, y: 1, z: 0 };
}

function getNearbyEntities(
  world: HiveWorld,
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

function buildFallbackConversation(input: {
  maxTurns: number;
  memoriesByNpc: Map<string, Array<{ content: string; importance: number }>>;
  prompt?: string | null;
  sourceNpc: HiveNpcRow;
  targetNpc?: HiveNpcRow | null;
  world: HiveWorld;
}): HiveConversation {
  const sourcePosition = asVector(input.sourceNpc.position);
  const targetPosition = input.targetNpc
    ? asVector(input.targetNpc.position)
    : null;
  const nearby = getNearbyEntities(input.world, sourcePosition);
  const firstObject = nearby.objects[0];
  const nextTarget = firstObject?.position ??
    targetPosition ?? {
      x: sourcePosition.x + 1,
      y: sourcePosition.y,
      z: sourcePosition.z,
    };
  const promptIntent = input.prompt?.trim()
    ? `Respond to the operator prompt: ${input.prompt.trim().slice(0, 180)}`
    : 'Keep the shared village simulation coherent.';
  const targetName = input.targetNpc?.name ?? 'the local settlement';
  const sourceMemory = input.memoriesByNpc.get(input.sourceNpc.id)?.[0];
  const sourceTurn: HiveInteractionTurn = {
    action: {
      target: nextTarget,
      type: input.targetNpc ? 'speak' : firstObject ? 'work' : 'move',
    },
    intent: promptIntent,
    memoryWrites:
      input.sourceNpc.memory_enabled && firstObject
        ? [
            `${input.sourceNpc.name} discussed ${firstObject.type} near ${firstObject.position.x},${firstObject.position.z}.`,
          ]
        : [],
    rationale: [
      `Role: ${input.sourceNpc.role}.`,
      `Nearby blocks: ${nearby.blocks.length}.`,
      `Nearby objects: ${nearby.objects.length}.`,
      sourceMemory ? `Memory: ${sourceMemory.content}` : null,
    ]
      .filter(Boolean)
      .join(' '),
    speakerNpcId: input.sourceNpc.id,
    spokenText: input.targetNpc
      ? `I want to coordinate with ${targetName} before changing the settlement.`
      : `I will ${firstObject ? `inspect the ${firstObject.type}` : 'walk to the next open tile'} and report what changes.`,
    targetNpcId: input.targetNpc?.id ?? null,
  };

  if (!input.targetNpc || input.maxTurns <= 1) {
    return {
      summary: `${input.sourceNpc.name} made one grounded decision.`,
      turns: [sourceTurn],
      worldImpact:
        'A single NPC decision was recorded for the current world revision.',
    };
  }

  const targetMemory = input.memoriesByNpc.get(input.targetNpc.id)?.[0];
  const replyTurn: HiveInteractionTurn = {
    action: {
      target: sourcePosition,
      type: 'speak',
    },
    intent:
      'Acknowledge the coordination request and keep the plan observable.',
    memoryWrites: input.targetNpc.memory_enabled
      ? [
          `${input.targetNpc.name} coordinated with ${input.sourceNpc.name} about the next settlement action.`,
        ]
      : [],
    rationale: [
      `Role: ${input.targetNpc.role}.`,
      targetMemory ? `Memory: ${targetMemory.content}` : null,
    ]
      .filter(Boolean)
      .join(' '),
    speakerNpcId: input.targetNpc.id,
    spokenText: `I can help. Let us keep the next action small and inspectable.`,
    targetNpcId: input.sourceNpc.id,
  };

  return {
    summary: `${input.sourceNpc.name} and ${input.targetNpc.name} coordinated one settlement action.`,
    turns: [sourceTurn, replyTurn].slice(0, input.maxTurns),
    worldImpact:
      'The interaction was recorded without changing voxel geometry.',
  };
}

function sanitizeConversation(input: {
  conversation: HiveConversation;
  maxTurns: number;
  sourceNpc: HiveNpcRow;
  targetNpc?: HiveNpcRow | null;
}) {
  const allowedNpcIds = new Set(
    [input.sourceNpc.id, input.targetNpc?.id].filter((value): value is string =>
      Boolean(value)
    )
  );
  const fallbackTargetId = input.targetNpc?.id ?? null;

  return {
    ...input.conversation,
    turns: input.conversation.turns
      .slice(0, input.maxTurns)
      .map((turn, index) => {
        const speakerNpcId = allowedNpcIds.has(turn.speakerNpcId)
          ? turn.speakerNpcId
          : index % 2 === 0
            ? input.sourceNpc.id
            : (input.targetNpc?.id ?? input.sourceNpc.id);
        const targetNpcId =
          turn.targetNpcId && allowedNpcIds.has(turn.targetNpcId)
            ? turn.targetNpcId
            : speakerNpcId === input.sourceNpc.id
              ? fallbackTargetId
              : input.sourceNpc.id;

        return {
          ...turn,
          memoryWrites: turn.memoryWrites.slice(0, 5),
          speakerNpcId,
          targetNpcId,
        };
      }),
  };
}

async function loadMemories(npcs: HiveNpcRow[]) {
  const memoriesByNpc = new Map<
    string,
    Array<{ content: string; importance: number }>
  >();

  await Promise.all(
    npcs.map(async (npc) => {
      try {
        memoriesByNpc.set(npc.id, await listHiveNpcMemories(npc.id));
      } catch (error) {
        serverLogger.warn('Failed to load Hive NPC memories', {
          error: error instanceof Error ? error.message : String(error),
          npcId: npc.id,
          serverId: npc.server_id,
        });
        memoriesByNpc.set(npc.id, []);
      }
    })
  );

  return memoriesByNpc;
}

function buildInputContext(input: {
  interactionId: string;
  maxTurns: number;
  memoriesByNpc: Map<string, Array<{ content: string; importance: number }>>;
  prompt?: string | null;
  promptMode: string;
  sourceNpc: HiveNpcRow;
  targetNpc?: HiveNpcRow | null;
  trigger: HiveNpcTrigger;
  world: HiveWorld;
}) {
  return {
    activeMemories: Object.fromEntries(input.memoriesByNpc.entries()),
    interactionId: input.interactionId,
    maxTurns: input.maxTurns,
    npcs: [
      {
        backstory: input.sourceNpc.backstory_enabled
          ? input.sourceNpc.backstory
          : null,
        id: input.sourceNpc.id,
        name: input.sourceNpc.name,
        position: input.sourceNpc.position,
        role: input.sourceNpc.role,
        settings: input.sourceNpc.settings,
        systemPrompt:
          input.promptMode === 'custom' && input.sourceNpc.custom_prompt_enabled
            ? input.sourceNpc.system_prompt
            : null,
      },
      input.targetNpc
        ? {
            backstory: input.targetNpc.backstory_enabled
              ? input.targetNpc.backstory
              : null,
            id: input.targetNpc.id,
            name: input.targetNpc.name,
            position: input.targetNpc.position,
            role: input.targetNpc.role,
            settings: input.targetNpc.settings,
            systemPrompt:
              input.promptMode === 'custom' &&
              input.targetNpc.custom_prompt_enabled
                ? input.targetNpc.system_prompt
                : null,
          }
        : null,
    ].filter(Boolean),
    operatorPrompt: input.prompt ?? null,
    promptMode: input.promptMode,
    trigger: input.trigger,
    world: input.world,
  };
}

async function generateConversation(input: {
  actorUserId: string | null;
  creditSource?: HiveCreditSource | null;
  creditWsId?: string | null;
  fallbackConversation: HiveConversation;
  inputContext: Record<string, unknown>;
  maxTurns: number;
  model?: string | null;
  sbAdmin: import('@tuturuuu/supabase/types').TypedSupabaseClient;
  systemPrompt?: string | null;
}) {
  const requestedModel = input.model ?? 'google/gemini-2.5-flash-lite';

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY || !input.actorUserId) {
    return {
      conversation: input.fallbackConversation,
      creditSource: null,
      creditWsId: null,
      creditsDeducted: 0,
      llmCost: 0,
      modelId: requestedModel,
      provider: 'deterministic',
      usage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
    };
  }

  const creditContext = await resolveHiveCreditContext({
    creditSource: input.creditSource,
    creditWsId: input.creditWsId,
    sbAdmin: input.sbAdmin,
    userId: input.actorUserId,
  });
  const modelId = await resolveHiveAllowedModel({
    requestedModel,
    wsId: creditContext.creditWsId,
  });
  const estimatedInputTokens = Math.ceil(
    JSON.stringify(input.inputContext).length / 4
  );
  const creditCheck = await checkAiCredits(
    creditContext.creditWsId,
    modelId,
    'chat',
    { estimatedInputTokens, userId: input.actorUserId }
  );

  if (!creditCheck.allowed) {
    throw new HiveAiAccessError(
      creditCheck.errorMessage ?? 'AI credits unavailable',
      402
    );
  }

  try {
    const result = await generateObject({
      model: google(toBareModelName(modelId)),
      prompt: [
        input.systemPrompt ||
          'You are a Hive NPC interaction model. Return grounded NPC-to-NPC turns for the current voxel simulation state.',
        `Maximum turns: ${input.maxTurns}`,
        `Context JSON: ${JSON.stringify(input.inputContext)}`,
      ].join('\n\n'),
      schema: hiveConversationSchema,
    });
    const usage = {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      reasoningTokens:
        result.usage.outputTokenDetails?.reasoningTokens ??
        result.usage.reasoningTokens ??
        0,
    };
    let creditsDeducted = 0;
    const deduction = await deductAiCredits({
      feature: 'chat',
      inputTokens: usage.inputTokens,
      metadata: {
        product: 'hive',
      },
      modelId,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
      userId: input.actorUserId,
      wsId: creditContext.creditWsId,
    });

    if (deduction.success) {
      creditsDeducted = deduction.creditsDeducted;
    } else {
      serverLogger.warn('Hive AI credit deduction failed', {
        errorCode: deduction.errorCode ?? 'UNKNOWN',
        modelId,
        wsId: creditContext.creditWsId,
      });
      throw new HiveAiAccessError('AI credits unavailable', 402);
    }

    return {
      conversation: result.object,
      creditSource: creditContext.creditSource,
      creditWsId: creditContext.creditWsId,
      creditsDeducted,
      llmCost: creditsDeducted,
      modelId,
      provider: 'google',
      usage,
    };
  } catch (error) {
    if (error instanceof HiveAiAccessError) {
      throw error;
    }

    serverLogger.warn('Hive NPC AI interaction generation failed', {
      error: error instanceof Error ? error.message : String(error),
      modelId,
    });

    return {
      conversation: input.fallbackConversation,
      creditSource: creditContext.creditSource,
      creditWsId: creditContext.creditWsId,
      creditsDeducted: 0,
      llmCost: 0,
      modelId,
      provider: 'deterministic',
      usage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
    };
  }
}

function mapRunDecision(input: {
  conversation: HiveConversation;
  turn: HiveInteractionTurn;
}) {
  return {
    action: input.turn.action,
    conversationSummary: input.conversation.summary,
    intent: input.turn.intent,
    memoryWrites: input.turn.memoryWrites,
    rationale: input.turn.rationale,
    spokenText: input.turn.spokenText,
    targetNpcId: input.turn.targetNpcId,
    worldImpact: input.conversation.worldImpact,
  };
}

export async function runHiveNpcInteraction(input: {
  actorUserId: string | null;
  autonomous?: boolean;
  creditSource?: HiveCreditSource | null;
  creditWsId?: string | null;
  expectedRevision: number;
  maxTurns?: number;
  model?: string | null;
  prompt?: string | null;
  promptMode?: 'custom' | 'default' | 'enhanced';
  researchSessionId?: string | null;
  sbAdmin: import('@tuturuuu/supabase/types').TypedSupabaseClient;
  serverId: string;
  sourceNpcId: string;
  targetNpcId?: string | null;
  trigger?: HiveNpcTrigger;
  world: HiveWorld;
}): Promise<{
  event: Awaited<ReturnType<typeof createHiveWorldEvent>>;
  interactionId: string;
  runs: HiveNpcRunRow[];
}> {
  await ensureHiveResearchSchema();
  const researchSessionId = await resolveHiveResearchSessionId({
    researchSessionId: input.researchSessionId,
    serverId: input.serverId,
  });
  const sourceNpc = await getHiveNpc({
    npcId: input.sourceNpcId,
    serverId: input.serverId,
  });

  if (!sourceNpc) {
    throw new HiveAiAccessError('Source NPC not found', 404);
  }

  const targetNpc = input.targetNpcId
    ? await getHiveNpc({
        npcId: input.targetNpcId,
        serverId: input.serverId,
      })
    : null;

  if (input.targetNpcId && !targetNpc) {
    throw new HiveAiAccessError('Target NPC not found', 404);
  }

  const maxTurns = Math.min(Math.max(input.maxTurns ?? 1, 1), 12);
  const interactionId = crypto.randomUUID();
  const memoriesByNpc = await loadMemories(
    [sourceNpc, targetNpc].filter((npc): npc is HiveNpcRow => Boolean(npc))
  );
  const inputContext = buildInputContext({
    interactionId,
    maxTurns,
    memoriesByNpc,
    prompt: input.prompt,
    promptMode: input.promptMode ?? 'enhanced',
    sourceNpc,
    targetNpc,
    trigger: input.trigger ?? 'manual',
    world: input.world,
  });
  const fallbackConversation = buildFallbackConversation({
    maxTurns,
    memoriesByNpc,
    prompt: input.prompt,
    sourceNpc,
    targetNpc,
    world: input.world,
  });
  const generated = await generateConversation({
    actorUserId: input.actorUserId,
    creditSource: input.creditSource,
    creditWsId: input.creditWsId,
    fallbackConversation,
    inputContext,
    maxTurns,
    model: input.model ?? sourceNpc.model,
    sbAdmin: input.sbAdmin,
    systemPrompt:
      input.promptMode === 'custom' && sourceNpc.custom_prompt_enabled
        ? sourceNpc.system_prompt
        : null,
  });
  const conversation = sanitizeConversation({
    conversation: generated.conversation,
    maxTurns,
    sourceNpc,
    targetNpc,
  });
  const runs: HiveNpcRunRow[] = [];
  const creditsPerTurn =
    conversation.turns.length > 0
      ? generated.creditsDeducted / conversation.turns.length
      : 0;

  for (const turn of conversation.turns) {
    const decision = mapRunDecision({ conversation, turn });
    const run = await persistHiveNpcRun({
      actorUserId: input.actorUserId,
      autonomous: input.autonomous ?? false,
      creditSource: generated.creditSource,
      creditWsId: generated.creditWsId,
      creditsDeducted: creditsPerTurn,
      decision,
      inputContext,
      inputTokens:
        turn === conversation.turns[0] ? generated.usage.inputTokens : 0,
      interactionId,
      llmCost: creditsPerTurn,
      llmModel: generated.modelId,
      llmProvider: generated.provider,
      npcId: turn.speakerNpcId,
      outputTokens:
        turn === conversation.turns.at(-1) ? generated.usage.outputTokens : 0,
      promptMode: input.promptMode ?? 'enhanced',
      researchSessionId,
      reasoningTokens:
        turn === conversation.turns.at(-1)
          ? generated.usage.reasoningTokens
          : 0,
      serverId: input.serverId,
      status: 'completed',
      targetNpcId: turn.targetNpcId,
      trigger: input.trigger ?? 'manual',
    });

    if (run) {
      runs.push(run);
      if (input.actorUserId) {
        await appendHiveNpcMemories({
          contents: turn.memoryWrites,
          createdBy: input.actorUserId,
          npcId: turn.speakerNpcId,
          runId: run.id,
          serverId: input.serverId,
        });
      }
    }
  }

  const event = await createHiveWorldEvent({
    actorUserId: input.actorUserId,
    eventType: targetNpc ? 'npc.interaction' : 'npc.decision',
    payload: {
      autonomous: input.autonomous ?? false,
      expectedRevision: input.expectedRevision,
      interactionId,
      model: generated.modelId,
      provider: generated.provider,
      researchSessionId,
      runIds: runs.map((run) => run.id),
      sourceNpcId: sourceNpc.id,
      summary: conversation.summary,
      targetNpcId: targetNpc?.id ?? null,
      trigger: input.trigger ?? 'manual',
      worldImpact: conversation.worldImpact,
    },
    researchSessionId,
    serverId: input.serverId,
    world: input.world,
  });

  return {
    event,
    interactionId,
    runs,
  };
}
