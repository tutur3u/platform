import 'server-only';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { z } from 'zod';
import {
  type EmployeeOperation,
  EmployeeOperationSchema,
  type EmployeeReadiness,
} from './employee-creation-readiness';

export type EmployeeAuthAdmin = Pick<
  TypedSupabaseClient['auth']['admin'],
  'createUser' | 'getUserById' | 'updateUserById'
>;

/** Structural injection matches executeFixedEmployeeSql; no import across apps. */
export type EmployeeFixedExecutor = (input: {
  phase: 'preflight' | 'finalize' | 'confirm';
  identity: unknown;
  database: unknown;
  requirements: unknown;
  signedProjectBinding?: unknown;
  executionQualification?: unknown;
  trustedOperatorPublicKey?: string;
}) => Promise<
  | { kind: 'denied' }
  | { kind: 'aborted' }
  | { kind: 'commit_unknown' }
  | { kind: 'committed'; result: unknown }
>;

export const EmployeeScopeSchema = z
  .object({
    operation: EmployeeOperationSchema,
    appSession: z.literal('infrastructure'),
    administrator: z.literal(true),
    actionAuthorized: z.literal(true),
    actionHeader: z.literal('1'),
    origin: z.url(),
    requestOrigin: z.url(),
    site: z.union([z.literal('same-origin'), z.null()]),
  })
  .strict()
  .refine((v) => v.origin === v.requestOrigin);
const ReceiptSchema = z
  .object({
    id: z.uuid(),
    email: z.string(),
    displayName: z.string(),
    status: z.enum(['pending', 'created']),
  })
  .strict();
const FinalizationSchema = z
  .object({
    operation: EmployeeOperationSchema,
    receipt: ReceiptSchema,
  })
  .strict();
export type EmployeeFinalizationProof = z.infer<typeof FinalizationSchema>;
export type EmployeeSqlReceipt = z.infer<typeof ReceiptSchema>;
export type EmployeeSqlResult =
  | { kind: 'denied' }
  | { kind: 'aborted' }
  | { kind: 'commit_unknown' }
  | {
      kind: 'committed';
      result: true | EmployeeSqlReceipt;
      continuationAllowed: boolean;
    };
export type EmployeeProviderResult =
  | { kind: 'denied' }
  | { kind: 'inspect_required' }
  | { kind: 'provider_conflict' }
  | { kind: 'provider_unknown' }
  | {
      kind: 'verified';
      state: 'banned' | 'active';
      continuationAllowed: boolean;
    };

function sameOperation(a: EmployeeOperation, b: EmployeeOperation) {
  return (
    a.operationId === b.operationId &&
    a.actorUserId === b.actorUserId &&
    a.targetUserId === b.targetUserId &&
    a.email === b.email &&
    a.displayName === b.displayName
  );
}
function receiptMatches(
  receipt: EmployeeSqlReceipt,
  operation: EmployeeOperation
) {
  return (
    receipt.id === operation.targetUserId &&
    receipt.email === operation.email &&
    receipt.displayName === operation.displayName
  );
}

/** No orchestration, UUID allocation, journal implementation, SQL or network
 * loader. Journal owns phase CAS and must hold its durable execution fence across
 * these calls. Scope reauthenticates actor/app session, origin/action permission
 * and current membership; SQL repeats authority on its owned connection.
 * Input is always the frozen original journal tuple, never a fresh client tuple.
 */
export function makeEmployeeCreationSupplier(deps: {
  executeFixedEmployeeSql: EmployeeFixedExecutor;
  auth: EmployeeAuthAdmin;
  readiness: () => Promise<EmployeeReadiness>;
  scope: (operation: EmployeeOperation) => Promise<unknown>;
  /** Atomic journal CAS: exact tuple, committed preflight, current lease; persist
   * attempted before returning true. No password/verifier in durable state. */
  consumeCreatePermission: (operation: EmployeeOperation) => Promise<boolean>;
  now: () => number;
}) {
  async function guard(operation: EmployeeOperation) {
    try {
      const readiness = await deps.readiness();
      if (readiness.kind !== 'qualified') return null;
      const scope = EmployeeScopeSchema.safeParse(await deps.scope(operation));
      if (!scope.success || !sameOperation(scope.data.operation, operation))
        return null;
      // Recheck expiry synchronously after the authorization await.
      const now = deps.now();
      if (
        !Number.isFinite(now) ||
        !Number.isFinite(readiness.observedAt) ||
        !Number.isFinite(readiness.expiresAt) ||
        now < readiness.observedAt ||
        now >= readiness.expiresAt
      )
        return null;
      return readiness.configuration;
    } catch {
      return null;
    }
  }
  function parse(input: unknown) {
    const value = EmployeeOperationSchema.safeParse(input);
    return value.success ? Object.freeze(value.data) : null;
  }
  async function sql(
    phase: 'preflight' | 'finalize' | 'confirm',
    operation: EmployeeOperation
  ): Promise<EmployeeSqlResult> {
    const configuration = await guard(operation);
    if (!configuration) return { kind: 'denied' };
    let outcome: Awaited<ReturnType<EmployeeFixedExecutor>>;
    try {
      outcome = await deps.executeFixedEmployeeSql({
        ...configuration,
        phase,
        identity: {
          actorUserId: operation.actorUserId,
          userId: operation.targetUserId,
          email: operation.email,
          displayName: operation.displayName,
        },
      });
    } catch {
      return { kind: 'commit_unknown' };
    }
    switch (outcome.kind) {
      case 'denied':
        return { kind: 'denied' };
      case 'aborted':
        return { kind: 'aborted' };
      case 'commit_unknown':
        return { kind: 'commit_unknown' };
      case 'committed': {
        const live = Boolean(await guard(operation));
        if (phase === 'preflight')
          return outcome.result === true
            ? { kind: 'committed', result: true, continuationAllowed: live }
            : { kind: 'commit_unknown' };
        const receipt = ReceiptSchema.safeParse(outcome.result);
        if (
          !receipt.success ||
          !receiptMatches(receipt.data, operation) ||
          receipt.data.status !== (phase === 'finalize' ? 'pending' : 'created')
        )
          return { kind: 'commit_unknown' };
        return {
          kind: 'committed',
          result: receipt.data,
          continuationAllowed: live,
        };
      }
      default: {
        const exhaustive: never = outcome;
        return exhaustive;
      }
    }
  }
  function providerState(
    value: unknown,
    operation: EmployeeOperation
  ): 'banned' | 'active' | null {
    const schema = z.object({
      id: z.uuid(),
      email: z.string(),
      email_confirmed_at: z.string().min(1),
      banned_until: z.string().nullable().optional(),
      app_metadata: z.object({ employee_onboarding: z.literal(true) }),
    });
    const user = schema.safeParse(value);
    const now = deps.now();
    if (
      !user.success ||
      !Number.isFinite(now) ||
      user.data.id !== operation.targetUserId ||
      user.data.email !== operation.email ||
      !Number.isFinite(Date.parse(user.data.email_confirmed_at))
    )
      return null;
    if (!user.data.banned_until) return 'active';
    const expires = Date.parse(user.data.banned_until);
    if (!Number.isFinite(expires)) return null;
    return expires > now ? 'banned' : 'active';
  }
  async function inspectOperation(
    operation: EmployeeOperation
  ): Promise<EmployeeProviderResult> {
    if (!(await guard(operation))) return { kind: 'denied' };
    try {
      const read = await deps.auth.getUserById(operation.targetUserId);
      const live = Boolean(await guard(operation));
      const state = !read.error && providerState(read.data.user, operation);
      return state
        ? { kind: 'verified', state, continuationAllowed: live }
        : { kind: 'provider_unknown' };
    } catch {
      return { kind: 'provider_unknown' };
    }
  }
  return {
    async preflight(input: unknown): Promise<EmployeeSqlResult> {
      const operation = parse(input);
      return operation ? sql('preflight', operation) : { kind: 'denied' };
    },
    async createOnce(
      input: unknown,
      temporaryPassword: unknown
    ): Promise<EmployeeProviderResult> {
      const operation = parse(input);
      const password = z.string().min(12).max(72).safeParse(temporaryPassword);
      if (!operation || !password.success || !(await guard(operation)))
        return { kind: 'denied' };
      try {
        // Must atomically journal attempted BEFORE the non-idempotent provider call.
        if (!(await deps.consumeCreatePermission(operation)))
          return { kind: 'inspect_required' };
        if (!(await guard(operation))) return { kind: 'inspect_required' };
        const reply = await deps.auth.createUser({
          id: operation.targetUserId,
          email: operation.email,
          password: password.data,
          email_confirm: true,
          ban_duration: '876000h',
          app_metadata: { employee_onboarding: true },
          user_metadata: {
            display_name: operation.displayName,
            full_name: operation.displayName,
          },
        });
        const live = Boolean(await guard(operation));
        if (reply.error)
          return ['email_exists', 'user_already_exists'].includes(
            reply.error.code ?? ''
          )
            ? { kind: 'provider_conflict' }
            : { kind: 'provider_unknown' };
        return providerState(reply.data.user, operation) === 'banned'
          ? { kind: 'verified', state: 'banned', continuationAllowed: live }
          : { kind: 'provider_unknown' };
      } catch {
        return { kind: 'provider_unknown' };
      }
    },
    async finalize(input: unknown): Promise<EmployeeSqlResult> {
      const operation = parse(input);
      if (!operation) return { kind: 'denied' };
      const inspected = await inspectOperation(operation);
      if (
        inspected.kind !== 'verified' ||
        inspected.state !== 'banned' ||
        !inspected.continuationAllowed
      )
        return { kind: 'denied' };
      return sql('finalize', operation);
    },
    async inspect(input: unknown): Promise<EmployeeProviderResult> {
      const operation = parse(input);
      return operation ? inspectOperation(operation) : { kind: 'denied' };
    },
    async activate(
      input: unknown,
      committedFinalization: unknown
    ): Promise<EmployeeSqlResult | EmployeeProviderResult> {
      const operation = parse(input);
      const finalization = FinalizationSchema.safeParse(committedFinalization);
      if (
        !operation ||
        !finalization.success ||
        finalization.data.receipt.status !== 'pending' ||
        !sameOperation(finalization.data.operation, operation) ||
        !receiptMatches(finalization.data.receipt, operation)
      )
        return { kind: 'denied' };
      const inspected = await inspectOperation(operation);
      if (inspected.kind !== 'verified' || !inspected.continuationAllowed)
        return inspected;
      if (inspected.state === 'banned') {
        if (!(await guard(operation))) return { kind: 'denied' };
        try {
          const update = await deps.auth.updateUserById(
            operation.targetUserId,
            { ban_duration: 'none' }
          );
          const live = Boolean(await guard(operation));
          if (
            update.error ||
            providerState(update.data.user, operation) !== 'active'
          )
            return { kind: 'provider_unknown' };
          if (!live)
            return {
              kind: 'verified',
              state: 'active',
              continuationAllowed: false,
            };
        } catch {
          return { kind: 'provider_unknown' };
        }
      }
      const active = await inspectOperation(operation);
      if (
        active.kind !== 'verified' ||
        active.state !== 'active' ||
        !active.continuationAllowed
      )
        return active;
      return sql('confirm', operation);
    },
  };
}
export type EmployeeCreationSupplier = ReturnType<
  typeof makeEmployeeCreationSupplier
>;

export type EmployeeCreationScope = z.infer<typeof EmployeeScopeSchema>;
export type EmployeeCreationSupplierDependencies = Parameters<
  typeof makeEmployeeCreationSupplier
>[0];
