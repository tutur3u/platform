import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  HiveMember,
  HiveNpc,
  HiveServer,
  HiveWorldEvent,
  Json,
} from '@tuturuuu/types/db';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';

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

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/gu, '')
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_');
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function getRealtimeSecret() {
  const secret = process.env.HIVE_REALTIME_TOKEN_SECRET;

  if (secret?.trim()) {
    return secret.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('HIVE_REALTIME_TOKEN_SECRET is required in production');
  }

  return 'hive-local-development-token-secret';
}

export function signHiveRealtimeToken(payload: Record<string, unknown>) {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', getRealtimeSecret())
    .update(encodedPayload)
    .digest();
  return `${encodedPayload}.${toBase64Url(signature)}`;
}

export function verifyHiveRealtimeToken(token: string) {
  const [encodedPayload, signature] = token.split('.');

  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = createHmac('sha256', getRealtimeSecret())
    .update(encodedPayload)
    .digest();
  const received = Buffer.from(
    signature.replace(/-/gu, '+').replace(/_/gu, '/'),
    'base64'
  );

  if (
    expected.byteLength !== received.byteLength ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }

  return JSON.parse(fromBase64Url(encodedPayload)) as Record<string, unknown>;
}

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
  const [
    { data: member, error: memberError },
    { data: role, error: roleError },
  ] = await Promise.all([
    sbAdmin
      .from('hive_members')
      .select('enabled')
      .eq('user_id', user.id)
      .maybeSingle(),
    sbAdmin
      .from('platform_user_roles')
      .select('enabled, allow_role_management')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

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

export function mapHiveServer(row: HiveServer) {
  return {
    createdAt: row.created_at,
    description: row.description,
    enabled: row.enabled,
    id: row.id,
    maxPlayers: row.max_players,
    name: row.name,
    slug: row.slug,
  };
}

export function mapHiveEvent(row: HiveWorldEvent) {
  return {
    actorUserId: row.actor_user_id,
    createdAt: row.created_at,
    eventType: row.event_type,
    id: row.id,
    payload: row.payload ?? {},
    revision: Number(row.revision ?? 0),
    serverId: row.server_id,
  };
}

export function mapHiveNpc(row: HiveNpc) {
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
    systemPrompt: row.system_prompt ?? '',
  };
}

export function mapHiveMember(
  row: Pick<HiveMember, 'created_at' | 'enabled' | 'id' | 'notes' | 'user_id'>
) {
  return {
    createdAt: row.created_at,
    enabled: row.enabled,
    id: row.id,
    notes: row.notes,
    userId: row.user_id,
  };
}
