import 'server-only';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { Effect, Either } from '@tuturuuu/utils/effect';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { z } from 'zod';
import { InternalAccountAdminError } from './errors';

export class EmployeeManagementError extends InternalAccountAdminError {
  constructor(
    readonly code: string,
    status: number = 503
  ) {
    super('Employee management could not be verified', status);
  }
}
export const RevisionSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const TupleSchema = z.strictObject({
  id: z.uuid(),
  email: z.string().email().refine(isExactTuturuuuDotComEmail),
});
export const OperationSchema = z.strictObject({
  operationId: z.uuid(),
  revision: RevisionSchema,
  phase: z.enum(['reserved', 'attempted', 'unknown', 'completed']),
});
export const InspectionSchema = z.strictObject({
  id: z.uuid(),
  email: z.string().nullable(),
  registryState: z.enum(['absent', 'pending', 'provisioned', 'active']),
  managedName: z.string().nullable(),
  managementRoleLabel: z.string().nullable(),
  revision: RevisionSchema.nullable(),
  mailboxReady: z.boolean(),
  readinessCode: z.enum([
    'ready',
    'not_managed',
    'creation_pending',
    'tuple_conflict',
    'mailbox_unavailable',
  ]),
  reservation: z.enum(['none', 'exact_intent', 'conflicting_tuple']),
  managed: z.boolean(),
  operation: OperationSchema.nullable(),
  recovery: z
    .strictObject({ email: z.string().nullable(), verified: z.boolean() })
    .nullable(),
});
export type Inspection = z.infer<typeof InspectionSchema>;
export type EmployeeRestorationProvider = Pick<
  TypedSupabaseClient['auth']['admin'],
  'getUserById' | 'updateUserById'
>;
export type EmployeeProviderUser = NonNullable<
  Awaited<
    ReturnType<EmployeeRestorationProvider['getUserById']>
  >['data']['user']
>;
export type EmployeeInspectionTuple = {
  actorUserId: string;
  targetUserId: string;
  email: string | null;
};
export type EmployeeRestoreTuple = {
  actorUserId: string;
  targetUserId: string;
  email: string;
  expectedRevision: number;
  operationId: string;
};
export type EmployeeRestorationOperations = {
  inspect(args: EmployeeInspectionTuple): PromiseLike<unknown>;
  begin(args: EmployeeRestoreTuple): PromiseLike<unknown>;
  markAttempt(args: EmployeeRestoreTuple): PromiseLike<unknown>;
  confirm(args: EmployeeRestoreTuple): PromiseLike<unknown>;
  reconcile(args: EmployeeRestoreTuple): PromiseLike<unknown>;
};
export type ManagementInput = {
  provider: EmployeeRestorationProvider;
  operations: EmployeeRestorationOperations;
  actorUserId: string;
  targetUserId: string;
};

export async function employeeStep<A>(
  operation: () => PromiseLike<A>
): Promise<A> {
  const result = await Effect.runPromise(
    Effect.either(
      Effect.tryPromise({
        try: () => Promise.resolve(operation()),
        catch: () =>
          new EmployeeManagementError('employee_management_unavailable'),
      })
    )
  );
  if (Either.isLeft(result)) throw result.left;
  return result.right;
}
const EnvelopeSchema = z.object({
  data: z.unknown(),
  error: z.union([z.null(), z.object({ code: z.string().min(1).max(128) })]),
});

// Semantic transport is unknown. Only own acknowledgement keys and a bounded
// error code can authorize data validation; diagnostics are never projected.
export async function employeeAcknowledgement(
  operation: () => PromiseLike<unknown>
) {
  const value = await employeeStep(operation);
  const parsed = await employeeStep(async () => {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      !Object.hasOwn(value, 'data') ||
      !Object.hasOwn(value, 'error') ||
      !('error' in value) ||
      !('data' in value)
    )
      throw new EmployeeManagementError('employee_management_unavailable');
    const error = value.error;
    if (
      error !== null &&
      (typeof error !== 'object' ||
        Array.isArray(error) ||
        !Object.hasOwn(error, 'code'))
    )
      throw new EmployeeManagementError('employee_management_unavailable');
    return EnvelopeSchema.safeParse({ data: value.data, error });
  });
  if (!parsed.success)
    throw new EmployeeManagementError('employee_management_unavailable');
  const result = parsed.data;
  if (result.error) {
    const code = result.error.code;
    const conflict = ['23505', '23514', '40001'].includes(code);
    throw new EmployeeManagementError(
      code === '42501'
        ? 'employee_management_forbidden'
        : code === 'P0002'
          ? 'employee_not_found'
          : conflict
            ? 'employee_management_conflict'
            : 'employee_management_unavailable',
      code === '42501' ? 403 : code === 'P0002' ? 404 : conflict ? 409 : 503
    );
  }
  return result.data;
}
export function providerState(user: EmployeeProviderUser | null) {
  if (!user) return 'missing' as const;
  if (!user.email_confirmed_at) return 'unconfirmed' as const;
  if (user.banned_until) {
    const time = Date.parse(user.banned_until);
    if (!Number.isFinite(time)) return 'unknown' as const;
    if (time > Date.now()) return 'confirmed_banned' as const;
  }
  return 'confirmed_active' as const;
}
export async function readEmployeeProvider(input: ManagementInput) {
  const result = await employeeStep(() =>
    input.provider.getUserById(input.targetUserId)
  );
  if (result.error) {
    if (result.error.code === 'user_not_found' || result.error.status === 404)
      return null;
    throw new EmployeeManagementError('employee_provider_unavailable');
  }
  const user = result.data.user;
  if (user && user.id !== input.targetUserId)
    throw new EmployeeManagementError('employee_provider_tuple_conflict', 409);
  return user;
}
export async function assertEmployeeServiceActor(input: ManagementInput) {
  if (input.actorUserId === input.targetUserId)
    throw new EmployeeManagementError('employee_self_action', 409);
  const result = await employeeStep(() =>
    input.provider.getUserById(input.actorUserId)
  );
  if (result.error)
    throw new EmployeeManagementError('employee_administrator_unavailable');
  if (
    !result.data.user ||
    result.data.user.id !== input.actorUserId ||
    !isExactTuturuuuDotComEmail(result.data.user.email) ||
    providerState(result.data.user) !== 'confirmed_active'
  ) {
    throw new EmployeeManagementError('employee_management_forbidden', 403);
  }
}
export async function inspectEmployeeManagement(
  input: ManagementInput,
  user: EmployeeProviderUser | null
) {
  const value = await employeeAcknowledgement(() =>
    input.operations.inspect({
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId,
      email: user?.email ?? null,
    })
  );
  const parsed = await employeeStep(async () =>
    InspectionSchema.safeParse(value)
  );
  if (
    !parsed.success ||
    parsed.data.id !== input.targetUserId ||
    (user && parsed.data.email !== user.email)
  ) {
    throw new EmployeeManagementError('employee_inspection_unavailable');
  }
  return parsed.data;
}
export function employeeNextAction(
  inspection: Inspection,
  state: ReturnType<typeof providerState>,
  marked: boolean
) {
  if (
    inspection.readinessCode === 'tuple_conflict' ||
    inspection.reservation === 'conflicting_tuple' ||
    state === 'unknown' ||
    state === 'unconfirmed' ||
    (marked && !inspection.managed)
  )
    return 'manual_review' as const;
  if (inspection.operation && inspection.operation.phase !== 'completed')
    return 'inspect' as const;
  if (inspection.registryState === 'absent')
    return inspection.reservation === 'exact_intent'
      ? ('creation_reconciliation_required' as const)
      : ('adoption_required' as const);
  if (inspection.registryState !== 'active')
    return 'creation_reconciliation_required' as const;
  if (!inspection.mailboxReady || !marked || state === 'missing')
    return 'manual_review' as const;
  return state === 'confirmed_banned'
    ? ('restore' as const)
    : ('none' as const);
}
