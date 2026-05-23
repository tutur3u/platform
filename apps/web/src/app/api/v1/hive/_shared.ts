import {
  getAppSessionTokenFromRequest,
  verifyAppSessionToken,
} from '@tuturuuu/auth/app-session';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types/db';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type {
  HiveAccessRequestRow,
  HiveMemberRow,
  HiveNpcRow,
  HiveNpcRunRow,
  HiveServerRow,
  HiveWorldEventRow,
} from '@/lib/hive/types';
import { resolveWebHiveAccess } from '@/lib/hive-page-context';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';

export {
  signHiveRealtimeToken,
  verifyHiveRealtimeToken,
} from './_realtime-token';

export { serverLogger };

export const hiveVectorSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

export const hiveJsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(hiveJsonSchema),
    z.record(z.string(), hiveJsonSchema),
  ])
);

export const hiveJsonObjectSchema = z.record(z.string(), hiveJsonSchema);

export const hiveWorldSchema = z.object({
  blocks: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(120),
        position: hiveVectorSchema,
        state: hiveJsonObjectSchema.optional(),
        type: z.string().trim().min(1).max(80),
      })
    )
    .max(10_000),
  objects: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(120),
        position: hiveVectorSchema,
        rotation: z.number().finite().optional(),
        state: hiveJsonObjectSchema.optional(),
        type: z.string().trim().min(1).max(80),
      })
    )
    .max(2_000),
});

export const hiveCrdtSyncSchema = z.object({
  stateVector: z.string().optional(),
});

export const hiveCrdtUpdateSchema = z.object({
  update: z.string().min(1),
  world: hiveWorldSchema.optional(),
});

export const hiveNpcSchema = z.object({
  backstory: z.string().max(10_000).default(''),
  backstoryEnabled: z.boolean().default(true),
  customPromptEnabled: z.boolean().default(false),
  memoryEnabled: z.boolean().default(true),
  model: z.string().trim().min(1).max(120).default('gemini-2.5-flash-lite'),
  name: z.string().trim().min(1).max(120),
  position: hiveVectorSchema.default({ x: 0, y: 1, z: 0 }),
  role: z.string().trim().min(1).max(200).default('resident'),
  settings: hiveJsonObjectSchema.default({}),
  systemPrompt: z.string().max(20_000).default(''),
});

export const hiveEventSchema = z.object({
  eventType: z
    .enum([
      'block.place',
      'block.remove',
      'object.place',
      'object.remove',
      'object.move',
      'npc.move',
      'npc.config',
      'npc.decision',
      'server.metadata',
      'crop.plant',
      'crop.water',
      'crop.harvest',
      'inventory.transfer',
      'trade.create',
      'trade.accept',
    ])
    .or(z.string().trim().min(1).max(80)),
  expectedRevision: z.number().int().min(0),
  payload: hiveJsonObjectSchema.default({}),
  researchSessionId: z.string().uuid().nullable().optional(),
  world: hiveWorldSchema,
});

export const hiveServerSchema = z.object({
  description: z.string().max(1000).nullable().optional(),
  enabled: z.boolean().default(true),
  maxPlayers: z.number().int().min(1).max(256).default(32),
  name: z.string().trim().min(1).max(120),
});

export const hiveServerSettingsSchema = z.object({
  autonomousNpcEnabled: z.boolean().optional(),
  cronEnabled: z.boolean().optional(),
  defaultCreditSource: z.enum(['personal', 'workspace']).optional(),
  defaultCreditWsId: z.string().uuid().nullable().optional(),
  defaultModel: z.string().trim().min(1).max(160).nullable().optional(),
  llmProvider: z.enum(['disabled', 'ollama', 'mira']).optional(),
  maxAutonomousInteractionsPerTick: z.number().int().min(0).max(20).optional(),
  maxInteractionTurns: z.number().int().min(1).max(12).optional(),
  maxLlmSpendPerTick: z.number().min(0).optional(),
  maxTickBudget: z.number().int().min(1).max(500).optional(),
  minInteractionCooldownSeconds: z.number().int().min(0).max(86_400).optional(),
  ollamaEnabled: z.boolean().optional(),
  ollamaKeepAlive: z.string().trim().min(1).max(40).optional(),
  ollamaModel: z.literal('gemma4').optional(),
  simulationCronEnabled: z.boolean().optional(),
  tickIntervalSeconds: z.number().int().min(30).max(86_400).optional(),
});

export const hiveNpcRunSchema = z.object({
  creditSource: z.enum(['personal', 'workspace']).optional(),
  creditWsId: z.string().uuid().optional(),
  expectedRevision: z.number().int().min(0),
  maxTurns: z.number().int().min(1).max(12).optional(),
  model: z.string().trim().min(1).max(160).optional(),
  promptMode: z.enum(['default', 'enhanced', 'custom']).default('enhanced'),
  prompt: z.string().trim().max(4000).nullable().optional(),
  researchSessionId: z.string().uuid().nullable().optional(),
  targetNpcId: z.string().uuid().nullable().optional(),
  trigger: z
    .enum(['manual', 'autonomous', 'workflow', 'simulation', 'cron'])
    .default('manual'),
  world: hiveWorldSchema,
});

export const hiveNpcInteractionSchema = z.object({
  creditSource: z.enum(['personal', 'workspace']).optional(),
  creditWsId: z.string().uuid().optional(),
  expectedRevision: z.number().int().min(0),
  maxTurns: z.number().int().min(1).max(12).default(4),
  model: z.string().trim().min(1).max(160).optional(),
  prompt: z.string().trim().max(4000).nullable().optional(),
  researchSessionId: z.string().uuid().nullable().optional(),
  sourceNpcId: z.string().uuid(),
  targetNpcId: z.string().uuid(),
  trigger: z
    .enum(['manual', 'autonomous', 'workflow', 'simulation', 'cron'])
    .default('manual'),
  world: hiveWorldSchema,
});

export const hiveMemberSchema = z.object({
  enabled: z.boolean().default(true),
  notes: z.string().max(1000).nullable().optional(),
  userId: z.string().uuid(),
});

export const hiveAccessRequestSchema = z.object({
  note: z.string().trim().max(1000).nullable().optional(),
});

export const hiveAccessRequestApprovalSchema = z.object({
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const hiveWorkflowNodeTypeSchema = z.enum([
  'condition',
  'context',
  'farming',
  'log',
  'manual_trigger',
  'npc_decision',
  'simulation_tick',
  'trade',
  'transform',
  'update_npc',
  'warehouse',
  'world_event',
]);

export const hiveWorkflowDefinitionSchema = z.object({
  edges: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(120),
        label: z.string().trim().max(120).optional(),
        source: z.string().trim().min(1).max(120),
        sourceHandle: z.string().trim().max(120).nullable().optional(),
        target: z.string().trim().min(1).max(120),
        targetHandle: z.string().trim().max(120).nullable().optional(),
      })
    )
    .max(120),
  nodes: z
    .array(
      z.object({
        data: z.object({
          config: hiveJsonObjectSchema.optional(),
          description: z.string().trim().max(500).optional(),
          label: z.string().trim().min(1).max(120),
        }),
        id: z.string().trim().min(1).max(120),
        position: z.object({
          x: z.number().finite(),
          y: z.number().finite(),
        }),
        type: hiveWorkflowNodeTypeSchema,
      })
    )
    .max(80),
  version: z.literal(1),
});

export const hiveWorkflowPayloadSchema = z.object({
  definition: hiveWorkflowDefinitionSchema,
  description: z.string().trim().max(1000).nullable().optional(),
  enabled: z.boolean().default(true),
  name: z.string().trim().min(1).max(120),
});

export const hiveWorkflowPatchSchema = hiveWorkflowPayloadSchema.partial();

export const hiveWorkflowRunPayloadSchema = z.object({
  input: hiveJsonObjectSchema.default({}),
  researchSessionId: z.string().uuid().nullable().optional(),
});

export const hiveResearchSessionPayloadSchema = z.object({
  description: z.string().trim().max(2000).nullable().optional(),
  metadata: hiveJsonObjectSchema.default({}),
  name: z.string().trim().min(1).max(160),
  status: z.enum(['paused', 'running']).default('running'),
});

export const hiveResearchSessionPatchSchema = z.object({
  description: z.string().trim().max(2000).nullable().optional(),
  metadata: hiveJsonObjectSchema.optional(),
  name: z.string().trim().min(1).max(160).optional(),
  status: z.enum(['archived', 'completed', 'paused', 'running']).optional(),
});

export const hivePairQueueRunSchema = z.object({
  creditSource: z.enum(['personal', 'workspace']).optional(),
  creditWsId: z.string().uuid().optional(),
  expectedRevision: z.number().int().min(0),
  maxPairs: z.number().int().min(1).max(100).default(50),
  maxTurns: z.number().int().min(1).max(12).default(4),
  model: z.string().trim().min(1).max(160).optional(),
  pairs: z
    .array(
      z.object({
        sourceNpcId: z.string().uuid(),
        targetNpcId: z.string().uuid(),
      })
    )
    .min(1)
    .max(100),
  prompt: z.string().trim().max(4000).nullable().optional(),
  world: hiveWorldSchema,
});

export type HiveAccess = {
  isAdmin: boolean;
  isMember: boolean;
  sbAdmin: TypedSupabaseClient;
  user: {
    email?: string | null;
    id: string;
  };
};

export async function resolveHiveRequestUser(request: NextRequest) {
  const appSessionToken = getAppSessionTokenFromRequest(request);

  if (appSessionToken) {
    const verification = verifyAppSessionToken(appSessionToken, {
      targetApp: 'hive',
    });

    if (!verification.ok) {
      return {
        error: new Error(verification.error),
        user: null,
      };
    }

    return {
      error: null,
      user: {
        email: verification.claims.email ?? null,
        id: verification.claims.sub,
      },
    };
  }

  const supabase = await createClient(request);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return {
    error,
    user: user?.id
      ? {
          email: user.email ?? null,
          id: user.id,
        }
      : null,
  };
}

export async function syncSupabaseHiveMember(
  sbAdmin: TypedSupabaseClient,
  input: {
    enabled: boolean;
    notes: string | null;
    userId: string;
  }
) {
  const { error } = await sbAdmin.from('hive_members').upsert(
    {
      enabled: input.enabled,
      notes: input.notes,
      updated_at: new Date().toISOString(),
      user_id: input.userId,
    },
    { onConflict: 'user_id' }
  );

  return error;
}

export function withHiveRoute(
  request: NextRequest,
  route: string,
  handler: () => Promise<Response>
) {
  return withRequestLogDrain({ request, route }, handler);
}

export async function requireHiveAccess(request: NextRequest) {
  const { error, user } = await resolveHiveRequestUser(request);

  if (error || !user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const sbAdmin = await createAdminClient({ noCookie: true });
  const accessResult = await resolveWebHiveAccess({
    sbAdmin,
    userId: user.id,
  });

  if ('error' in accessResult) {
    serverLogger.error('Failed to resolve Hive access', {
      userId: user.id,
    });
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Failed to resolve Hive access' },
        { status: 500 }
      ),
    };
  }

  const access = {
    isAdmin: accessResult.isAdmin,
    isMember: accessResult.isMember,
    sbAdmin,
    user,
  };

  if (!(access.isAdmin || access.isMember)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Hive access required' },
        { status: 403 }
      ),
    };
  }

  return {
    access,
    ok: true as const,
  };
}

export async function requireHiveAdmin(request: NextRequest) {
  const result = await requireHiveAccess(request);

  if (!result.ok) {
    return result;
  }

  if (!result.access.isAdmin) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Hive admin access required' },
        { status: 403 }
      ),
    };
  }

  return result;
}

export function slugifyHiveServerName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

  return slug || 'hive-server';
}

export function mapHiveServer(row: HiveServerRow) {
  return {
    createdAt: row.created_at,
    description: row.description,
    enabled: row.enabled,
    id: row.id,
    maxPlayers: row.max_players,
    name: row.name,
    ollamaState: row.ollama_state ?? {},
    settings: row.settings ?? {},
    slug: row.slug,
    totalCurrency: Number(row.total_currency ?? 0),
  };
}

export function mapHiveEvent(row: HiveWorldEventRow) {
  return {
    actorUserId: row.actor_user_id,
    createdAt: row.created_at,
    eventType: row.event_type,
    id: row.id,
    payload: row.payload ?? {},
    researchSessionId: row.research_session_id ?? null,
    revision: Number(row.revision ?? row.op_seq ?? 0),
    serverId: row.server_id,
  };
}

export function mapHiveNpc(row: HiveNpcRow) {
  return {
    backstory: row.backstory ?? '',
    backstoryEnabled: !!row.backstory_enabled,
    customPromptEnabled: !!row.custom_prompt_enabled,
    id: row.id,
    memoryEnabled: !!row.memory_enabled,
    model: row.model,
    name: row.name,
    position: row.position ?? { x: 0, y: 1, z: 0 },
    role: row.role,
    serverId: row.server_id,
    settings: row.settings ?? {},
    status: row.status ?? 'active',
    systemPrompt: row.system_prompt ?? '',
  };
}

export function mapHiveNpcRun(row: HiveNpcRunRow) {
  return {
    actorUserId: row.actor_user_id,
    autonomous: row.autonomous === true,
    creditSource:
      row.credit_source === 'personal' || row.credit_source === 'workspace'
        ? row.credit_source
        : null,
    creditWsId: row.credit_ws_id,
    creditsDeducted: Number(row.credits_deducted ?? 0),
    createdAt: row.created_at,
    error: row.error,
    id: row.id,
    inputContext:
      row.input_context &&
      typeof row.input_context === 'object' &&
      !Array.isArray(row.input_context)
        ? row.input_context
        : {},
    inputTokens: Number(row.input_tokens ?? 0),
    interactionId: row.interaction_id,
    llmCost: Number(row.llm_cost ?? 0),
    llmModel: row.llm_model,
    llmProvider: row.llm_provider,
    npcId: row.npc_id,
    outputDecision:
      row.output_decision &&
      typeof row.output_decision === 'object' &&
      !Array.isArray(row.output_decision)
        ? row.output_decision
        : {},
    outputTokens: Number(row.output_tokens ?? 0),
    promptMode: row.prompt_mode,
    researchSessionId: row.research_session_id ?? null,
    reasoningTokens: Number(row.reasoning_tokens ?? 0),
    status:
      row.status === 'running' ||
      row.status === 'failed' ||
      row.status === 'skipped'
        ? row.status
        : 'completed',
    targetNpcId: row.target_npc_id,
    trigger:
      row.trigger === 'autonomous' ||
      row.trigger === 'cron' ||
      row.trigger === 'simulation' ||
      row.trigger === 'workflow'
        ? row.trigger
        : 'manual',
  };
}

export function mapHiveMember(row: HiveMemberRow) {
  return {
    createdAt: row.created_at,
    enabled: row.enabled,
    id: row.id,
    notes: row.notes,
    userId: row.user_id,
  };
}

export function mapHiveAccessRequest(row: HiveAccessRequestRow) {
  return {
    createdAt: row.created_at,
    email: row.email,
    id: row.id,
    note: row.note,
    requestedAt: row.requested_at,
    resolutionNote: row.resolution_note,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    status: row.status,
    updatedAt: row.updated_at,
    userId: row.user_id,
  };
}
