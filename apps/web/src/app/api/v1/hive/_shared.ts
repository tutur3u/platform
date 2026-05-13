import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types/db';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getHiveMemberByUserId } from '@/lib/hive/hive-db';
import type {
  HiveMemberRow,
  HiveNpcRow,
  HiveServerRow,
  HiveWorldEventRow,
} from '@/lib/hive/types';
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
  llmProvider: z.enum(['disabled', 'ollama', 'mira']).optional(),
  maxLlmSpendPerTick: z.number().min(0).optional(),
  maxTickBudget: z.number().int().min(1).max(500).optional(),
  ollamaEnabled: z.boolean().optional(),
  ollamaKeepAlive: z.string().trim().min(1).max(40).optional(),
  ollamaModel: z.literal('gemma4').optional(),
  simulationCronEnabled: z.boolean().optional(),
  tickIntervalSeconds: z.number().int().min(30).max(86_400).optional(),
});

export const hiveNpcRunSchema = z.object({
  expectedRevision: z.number().int().min(0),
  promptMode: z.enum(['default', 'enhanced', 'custom']).default('enhanced'),
  world: hiveWorldSchema,
});

export const hiveMemberSchema = z.object({
  enabled: z.boolean().default(true),
  notes: z.string().max(1000).nullable().optional(),
  userId: z.string().uuid(),
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

export function withHiveRoute(
  request: NextRequest,
  route: string,
  handler: () => Promise<Response>
) {
  return withRequestLogDrain({ request, route }, handler);
}

export async function requireHiveAccess(request: NextRequest) {
  const supabase = await createClient(request);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const sbAdmin = await createAdminClient();
  let member: Awaited<ReturnType<typeof getHiveMemberByUserId>> | null = null;
  let memberError: Error | null = null;
  const { data: role, error: roleError } = await sbAdmin
    .from('platform_user_roles')
    .select('enabled, allow_role_management')
    .eq('user_id', user.id)
    .maybeSingle();

  try {
    member = await getHiveMemberByUserId(user.id);
  } catch (error) {
    memberError =
      error instanceof Error ? error : new Error('Hive DB lookup failed');
  }

  if (memberError || roleError) {
    serverLogger.error('Failed to resolve Hive access', {
      memberError: memberError?.message,
      roleError: roleError?.message,
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
    isAdmin: !!role?.enabled && !!role.allow_role_management,
    isMember: !!member?.enabled,
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

export function mapHiveMember(row: HiveMemberRow) {
  return {
    createdAt: row.created_at,
    enabled: row.enabled,
    id: row.id,
    notes: row.notes,
    userId: row.user_id,
  };
}
