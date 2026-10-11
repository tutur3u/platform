import 'server-only';
import { randomUUID } from 'node:crypto';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { Effect, Either } from '@tuturuuu/utils/effect';
import { z } from 'zod';
import { InternalAccountAdminError } from './errors';

export class EmployeeCreationError extends InternalAccountAdminError {
  constructor(
    message: string,
    status: number,
    readonly code: string
  ) {
    super(message, status);
  }
}

const AccountSchema = z.object({
  id: z.string().min(1),
  email: z.string(),
  displayName: z.string(),
});
const FinalizeSchema = AccountSchema.extend({ status: z.literal('pending') });
const ConfirmSchema = AccountSchema.extend({ status: z.literal('created') });

export type EmployeeCreationProvider = Pick<
  TypedSupabaseClient['auth']['admin'],
  'createUser' | 'updateUserById' | 'getUserById'
>;

export type EmployeeCreationOperations = {
  preflight(args: {
    actorUserId: string;
    userId: string;
    email: string;
    displayName: string;
  }): PromiseLike<unknown>;
  finalize(args: {
    actorUserId: string;
    userId: string;
    email: string;
    displayName: string;
  }): PromiseLike<unknown>;
  confirmActivation(args: {
    actorUserId: string;
    userId: string;
    email: string;
  }): PromiseLike<unknown>;
};

export type EmployeeCreationInput = {
  actorUserId: string;
  email: string;
  displayName: string;
  temporaryPassword: string;
  operations: EmployeeCreationOperations;
  provider: EmployeeCreationProvider;
};

const EnvelopeSchema = z.object({
  data: z.unknown(),
  error: z.union([z.null(), z.object({ code: z.string().optional() })]),
});

function acknowledgement(value: unknown) {
  if (
    typeof value !== 'object' ||
    value === null ||
    !Object.hasOwn(value, 'data') ||
    !Object.hasOwn(value, 'error')
  )
    return undefined;
  const parsed = EnvelopeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

const pending = (unknownOutcome: boolean) => ({
  status: 'pending' as const,
  code: unknownOutcome
    ? 'account_creation_outcome_unknown'
    : 'employee_provisioning_pending',
  message:
    'Account creation is pending. Refresh the directory before retrying; do not submit another creation request.',
});

function step<A>(
  operation: () => PromiseLike<A>,
  failure: EmployeeCreationError
) {
  return Effect.tryPromise({
    try: () => Promise.resolve(operation()),
    catch: () => failure,
  });
}

/**
 * Caller must freshly authenticate and authorize the root administrator, supply
 * the trusted actor/provider, and validate strict HTTP input: normalized exact
 * @tuturuuu.com email (max 320), trimmed name (1..100), password (12..72),
 * action header=1, same-origin/site when supplied, JSON and no extra properties.
 * These preconditions are not permission proof. A protected SQL adapter must
 * independently repeat fresh authority and reservation checks; it remains held.
 */
export async function createEmployeeAccount({
  actorUserId,
  email,
  displayName,
  temporaryPassword,
  operations,
  provider,
}: EmployeeCreationInput) {
  const unavailable = new EmployeeCreationError(
    'Employee creation is unavailable',
    503,
    'employee_creation_unavailable'
  );
  const targetUserId = randomUUID();
  const program = Effect.gen(function* () {
    const preflightReply = yield* step(
      () =>
        operations.preflight({
          actorUserId,
          userId: targetUserId,
          email,
          displayName,
        }),
      unavailable
    );
    const preflight = acknowledgement(preflightReply);
    if (!preflight) return yield* Effect.fail(unavailable);
    if (preflight.error || preflight.data !== true) {
      return yield* Effect.fail(
        new EmployeeCreationError(
          preflight.error?.code === '23505'
            ? 'The account or email reservation already exists'
            : 'Employee creation is unavailable',
          preflight.error?.code === '23505'
            ? 409
            : preflight.error?.code === '42501'
              ? 403
              : 503,
          preflight.error?.code === '23505'
            ? 'employee_account_conflict'
            : 'employee_creation_unavailable'
        )
      );
    }

    // Non-idempotent provider operations run once. A lost response is retained,
    // never followed by compensating deletion or a second creation attempt.
    const created = yield* Effect.either(
      step(
        () =>
          provider.createUser({
            id: targetUserId,
            email,
            password: temporaryPassword,
            email_confirm: true,
            ban_duration: '876000h',
            app_metadata: { employee_onboarding: true },
            user_metadata: {
              display_name: displayName,
              full_name: displayName,
            },
          }),
        unavailable
      )
    );
    if (Either.isLeft(created)) return pending(true);
    if (created.right.error) {
      if (
        ['email_exists', 'user_already_exists'].includes(
          created.right.error.code ?? ''
        )
      ) {
        return yield* Effect.fail(
          new EmployeeCreationError(
            'The account already exists',
            409,
            'employee_account_conflict'
          )
        );
      }
      return pending(true);
    }
    const user = created.right.data.user;
    if (
      !user ||
      user.id !== targetUserId ||
      user.email !== email ||
      !user.email_confirmed_at ||
      user.app_metadata?.employee_onboarding !== true ||
      !user.banned_until ||
      !(Date.parse(user.banned_until) > Date.now())
    )
      return pending(true);

    const finalized = yield* Effect.either(
      step(
        () =>
          operations.finalize({
            actorUserId,
            userId: user.id,
            email,
            displayName,
          }),
        unavailable
      )
    );
    if (Either.isLeft(finalized)) return pending(true);
    const finalizeReply = acknowledgement(finalized.right);
    if (!finalizeReply) return pending(true);
    if (finalizeReply.error)
      return pending(
        !['23505', '23514', '23503', '42501', 'P0002'].includes(
          finalizeReply.error.code ?? ''
        )
      );
    const provisioned = FinalizeSchema.safeParse(finalizeReply.data);
    if (
      !provisioned.success ||
      provisioned.data.id !== user.id ||
      provisioned.data.email !== email ||
      provisioned.data.displayName !== displayName
    )
      return pending(true);

    const activated = yield* Effect.either(
      step(
        () => provider.updateUserById(user.id, { ban_duration: 'none' }),
        unavailable
      )
    );
    if (
      Either.isLeft(activated) ||
      activated.right.error ||
      activated.right.data.user?.id !== user.id
    )
      return pending(true);
    const read = yield* Effect.either(
      step(() => provider.getUserById(user.id), unavailable)
    );
    if (Either.isLeft(read) || read.right.error) return pending(true);
    const current = read.right.data.user;
    if (
      !current ||
      current.id !== user.id ||
      current.email !== email ||
      !current.email_confirmed_at ||
      current.app_metadata?.employee_onboarding !== true ||
      (current.banned_until &&
        !(Date.parse(current.banned_until) <= Date.now()))
    )
      return pending(true);
    const confirmed = yield* Effect.either(
      step(
        () =>
          operations.confirmActivation({
            actorUserId,
            userId: user.id,
            email,
          }),
        unavailable
      )
    );
    if (Either.isLeft(confirmed)) return pending(true);
    const confirmReply = acknowledgement(confirmed.right);
    if (!confirmReply || confirmReply.error) return pending(true);
    const result = ConfirmSchema.safeParse(confirmReply.data);
    if (
      !result.success ||
      result.data.id !== user.id ||
      result.data.email !== email ||
      result.data.displayName !== displayName
    )
      return pending(true);
    return {
      status: 'created' as const,
      account: AccountSchema.parse(result.data),
    };
  });
  const result = await Effect.runPromise(Effect.either(program));
  if (Either.isLeft(result)) throw result.left;
  return result.right;
}
