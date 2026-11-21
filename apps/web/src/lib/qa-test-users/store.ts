import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { z } from 'zod';
import type { QaTier } from './policy';

export type QaActor = 'operator' | 'cron';

const tier = z.enum(['FREE', 'PLUS', 'PRO']);
export const reservationSchema = z.object({
  runId: z.string(),
  purpose: z.string(),
  expiresAt: z.string(),
  users: z.array(
    z.object({
      userId: z.uuid(),
      email: z.string(),
      ordinal: z.number().int(),
      staff: z.boolean(),
      tier,
    })
  ),
});
const activationSchema = z
  .object({
    userId: z.uuid(),
    personalWorkspaceId: z.uuid().nullable(),
    runWorkspaceId: z.uuid().nullable(),
  })
  .nullable();
const sessionGrantSchema = z
  .object({
    userId: z.uuid(),
    email: z.string(),
    runId: z.string(),
    expiresAt: z.string(),
  })
  .nullable();
export const beginDeleteSchema = z.object({
  state: z.enum(['not_found', 'deleted', 'busy', 'deleting']),
  authPresent: z.boolean().optional(),
  runId: z.string().optional(),
  runWorkspaceId: z.uuid().nullable().optional(),
});
export const finishDeleteSchema = z.object({
  state: z.enum(['not_found', 'pending', 'active', 'present', 'deleted']),
});
const expiredSchema = z.object({
  mode: z.enum(['fenced', 'run']),
  userIds: z.array(z.uuid()),
});
export const qaUserRowSchema = z.object({
  userId: z.uuid(),
  email: z.string(),
  runId: z.string(),
  ordinal: z.number().int(),
  staff: z.boolean(),
  tier,
  state: z.enum(['pending', 'active', 'deleting', 'deleted']),
  purpose: z.string(),
  operatorUserId: z.uuid(),
  expiresAt: z.string(),
  runWorkspaceId: z.uuid().nullable(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type QaUserRow = z.infer<typeof qaUserRowSchema>;

export interface ReserveQaUsers {
  operatorUserId: string;
  runId: string | null;
  purpose: string | null;
  ttlSeconds: number | null;
  count: number;
  staff: boolean;
  tier: QaTier;
  workspace: boolean;
}

/** Typed access to the private QA ledger RPCs. Every call goes through the service role. */
export interface QaStore {
  reserve(input: ReserveQaUsers): Promise<z.infer<typeof reservationSchema>>;
  activate(
    userId: string,
    actorUserId: string
  ): Promise<z.infer<typeof activationSchema>>;
  recordSession(
    userId: string,
    actorUserId: string
  ): Promise<z.infer<typeof sessionGrantSchema>>;
  beginDelete(
    userId: string,
    actor: QaActor,
    actorUserId: string | null
  ): Promise<z.infer<typeof beginDeleteSchema>>;
  finishDelete(
    userId: string,
    actor: QaActor,
    actorUserId: string | null
  ): Promise<z.infer<typeof finishDeleteSchema>>;
  finishWorkspaceDelete(
    runId: string,
    actor: QaActor,
    actorUserId: string | null
  ): Promise<boolean>;
  listExpired(limit: number): Promise<z.infer<typeof expiredSchema>>;
  listUsers(
    runId: string | null,
    includeDeleted: boolean
  ): Promise<QaUserRow[]>;
}

export class QaStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'QaStoreError';
  }
}

// Postgres error codes raised by the ledger, mapped to HTTP statuses.
const STATUS_BY_CODE: Record<string, number> = {
  '22023': 400,
  '23505': 409,
  '42501': 403,
  '54000': 429,
  '55000': 503,
};

function unwrap<T>(
  result: { data: unknown; error: { code?: string; message?: string } | null },
  schema: z.ZodType<T>
): T {
  if (result.error) {
    const status = STATUS_BY_CODE[result.error.code ?? ''] ?? 503;
    throw new QaStoreError(
      status === 503
        ? 'QA test user ledger unavailable'
        : (result.error.message ?? 'Request refused'),
      status,
      result.error.code
    );
  }
  const parsed = schema.safeParse(result.data);
  if (!parsed.success)
    throw new QaStoreError(
      'QA test user ledger returned an invalid result',
      503
    );
  return parsed.data;
}

export function createQaStore(admin: TypedSupabaseClient): QaStore {
  const rpc = admin.schema('private');
  return {
    async reserve(input) {
      return unwrap(
        await rpc.rpc('qa_test_reserve_users', {
          p_operator: input.operatorUserId,
          p_run_id: input.runId as string,
          p_purpose: input.purpose as string,
          p_ttl_seconds: input.ttlSeconds as number,
          p_count: input.count,
          p_staff: input.staff,
          p_tier: input.tier,
          p_workspace: input.workspace,
        }),
        reservationSchema
      );
    },
    async activate(userId, actorUserId) {
      return unwrap(
        await rpc.rpc('qa_test_activate_user', {
          p_user_id: userId,
          p_actor: actorUserId,
        }),
        activationSchema
      );
    },
    async recordSession(userId, actorUserId) {
      return unwrap(
        await rpc.rpc('qa_test_record_session', {
          p_user_id: userId,
          p_actor: actorUserId,
        }),
        sessionGrantSchema
      );
    },
    async beginDelete(userId, actor, actorUserId) {
      return unwrap(
        await rpc.rpc('qa_test_begin_delete', {
          p_user_id: userId,
          p_actor: actor,
          p_actor_user: actorUserId as string,
        }),
        beginDeleteSchema
      );
    },
    async finishDelete(userId, actor, actorUserId) {
      return unwrap(
        await rpc.rpc('qa_test_finish_delete', {
          p_user_id: userId,
          p_actor: actor,
          p_actor_user: actorUserId as string,
        }),
        finishDeleteSchema
      );
    },
    async finishWorkspaceDelete(runId, actor, actorUserId) {
      return unwrap(
        await rpc.rpc('qa_test_finish_workspace_delete', {
          p_run_id: runId,
          p_actor: actor,
          p_actor_user: actorUserId as string,
        }),
        z.boolean()
      );
    },
    async listExpired(limit) {
      return unwrap(
        await rpc.rpc('qa_test_list_expired', { p_limit: limit }),
        expiredSchema
      );
    },
    async listUsers(runId, includeDeleted) {
      return unwrap(
        await rpc.rpc('qa_test_list_users', {
          p_run_id: runId as string,
          p_include_deleted: includeDeleted,
        }),
        z.array(qaUserRowSchema)
      );
    },
  };
}
