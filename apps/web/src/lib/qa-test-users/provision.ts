import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { type QaDeletionDeps, deleteQaUser } from './deletion';
import {
  type CreateQaUsersInput,
  generateQaPassword,
  QA_CREATE_CONCURRENCY,
  qaTestMarker,
} from './policy';

export async function completeQaOnboarding(
  admin: Pick<TypedSupabaseClient, 'from'>,
  userId: string
) {
  const onboarding = await admin.from('onboarding_progress').upsert({
    user_id: userId,
    completed_steps: ['welcome', 'use_case', 'profile', 'celebration'],
    current_step: 'celebration',
    profile_completed: true,
    completed_at: new Date().toISOString(),
    use_case: 'personal',
    flow_type: 'personal',
    notifications_enabled: false,
  });
  if (onboarding.error)
    throw Object.assign(new Error('Onboarding completion failed'), {
      code: onboarding.error.code,
    });
}

export interface QaProvisionDeps extends QaDeletionDeps {
  admin: Pick<TypedSupabaseClient, 'auth' | 'from'>;
}

export interface CreatedQaUser {
  userId: string;
  email: string;
  ordinal: number;
  staff: boolean;
  tier: string;
  /** Returned once; the caller must store it as a credential and never print it. */
  password: string;
}

export interface QaProvisionResult {
  runId: string;
  purpose: string;
  expiresAt: string;
  runWorkspaceId: string | null;
  users: CreatedQaUser[];
  failed: Array<{
    userId: string;
    email: string;
    /** Fixed-vocabulary step that failed; never an error message. */
    stage: QaProvisionStage;
    /** Postgres, PostgREST or Auth error code when the step reported one. */
    code?: string;
    cleanup: string;
  }>;
}

export type QaProvisionStage = 'auth_create' | 'onboarding' | 'activate';

class QaProvisionStepError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = 'QaProvisionStepError';
  }
}

/**
 * A short machine code (Postgres/PostgREST SQLSTATE, Auth error code or HTTP
 * status) that identifies why a step failed. Messages are never returned, as
 * they can carry row data.
 */
function failureCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Za-z0-9_]{1,32}$/.test(code)
    ? code
    : undefined;
}

/**
 * Reserves addresses in the ledger, creates each Auth account with the
 * immutable QA marker, completes onboarding so automation lands on the app,
 * then activates it (test tier and run workspace). A failed account is rolled
 * back through the same marker-checked deletion path.
 */
export async function createQaUsers(
  deps: QaProvisionDeps,
  operatorUserId: string,
  input: CreateQaUsersInput
): Promise<QaProvisionResult> {
  const reservation = await deps.store.reserve({
    operatorUserId,
    runId: input.runId ?? null,
    purpose: input.runId ? null : (input.purpose ?? null),
    ttlSeconds: input.runId ? null : (input.ttlSeconds ?? null),
    count: input.count,
    staff: input.staff,
    tier: input.tier,
    workspace: input.workspace,
  });

  const result: QaProvisionResult = {
    runId: reservation.runId,
    purpose: reservation.purpose,
    expiresAt: reservation.expiresAt,
    runWorkspaceId: null,
    users: [],
    failed: [],
  };
  const marker = qaTestMarker({
    expiresAt: reservation.expiresAt,
    operatorUserId,
    purpose: reservation.purpose,
    runId: reservation.runId,
    staff: input.staff,
  });

  // Ordinal order matters: the first activated account creates the run
  // workspace and becomes its owner, so create the first account alone.
  const [first, ...rest] = reservation.users;
  const provisionOne = async (user: (typeof reservation.users)[number]) => {
    const password = generateQaPassword();
    let stage: QaProvisionStage = 'auth_create';
    try {
      const created = await deps.admin.auth.admin.createUser({
        id: user.userId,
        email: user.email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: `[QA] ${reservation.purpose} ${user.ordinal}`,
        },
        app_metadata: marker,
      });
      if (created.error || created.data.user?.id !== user.userId)
        throw new QaProvisionStepError(
          'Auth account creation failed',
          created.error?.code ??
            (created.error?.status ? `http_${created.error.status}` : undefined)
        );
      stage = 'onboarding';
      await completeQaOnboarding(deps.admin, user.userId);
      stage = 'activate';
      const activated = await deps.store.activate(user.userId, operatorUserId);
      if (!activated)
        throw new QaProvisionStepError('Activation refused', 'refused');
      result.runWorkspaceId ??= activated.runWorkspaceId;
      result.users.push({ ...user, password });
    } catch (error) {
      const code = failureCode(error);
      console.error('QA test account provisioning failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
        stage,
        code: code ?? null,
        userId: user.userId,
      });
      const cleanup = await deleteQaUser(
        deps,
        user.userId,
        'operator',
        operatorUserId
      ).catch(() => 'pending' as const);
      result.failed.push({
        userId: user.userId,
        email: user.email,
        stage,
        ...(code ? { code } : {}),
        cleanup,
      });
    }
  };

  if (first) await provisionOne(first);
  let next = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(QA_CREATE_CONCURRENCY, rest.length) },
      async () => {
        while (next < rest.length) await provisionOne(rest[next++]!);
      }
    )
  );
  result.users.sort((a, b) => a.ordinal - b.ordinal);
  return result;
}
