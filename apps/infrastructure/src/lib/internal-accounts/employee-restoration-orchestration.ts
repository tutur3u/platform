import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  assertEmployeeServiceActor,
  EmployeeManagementError,
  employeeAcknowledgement,
  employeeNextAction,
  type EmployeeProviderUser,
  type EmployeeRestoreTuple,
  employeeStep,
  type Inspection,
  inspectEmployeeManagement,
  type ManagementInput,
  OperationSchema,
  providerState,
  RevisionSchema,
  readEmployeeProvider,
  TupleSchema,
} from './employee-restoration-boundary';

export const RestoreInputSchema = z.strictObject({
  confirmationEmail: TupleSchema.shape.email,
  expectedRevision: RevisionSchema,
});
export const ReconcileInputSchema = z.strictObject({
  ...RestoreInputSchema.shape,
  operationId: z.uuid().optional(),
});
export type EmployeeRestorationInput = ManagementInput &
  z.infer<typeof RestoreInputSchema>;
const ReceiptSchema = z.strictObject({
  ...TupleSchema.shape,
  displayName: z.string().min(1),
  operationId: z.uuid(),
  revision: RevisionSchema,
  status: z.literal('restored'),
});
function pending(operationId: string, uncertain = true) {
  return {
    status: 'pending' as const,
    code: uncertain
      ? 'employee_restore_outcome_unknown'
      : 'employee_restore_confirmation_pending',
    operationId,
    nextAction: 'inspect' as const,
    message:
      'Employee restoration is pending. Inspect this operation before taking another action.',
  };
}
function boundProvider(
  user: EmployeeProviderUser | null,
  input: EmployeeRestorationInput,
  active: boolean
) {
  return (
    user?.id === input.targetUserId &&
    user.email === input.confirmationEmail &&
    user.app_metadata?.employee_onboarding === true &&
    (active
      ? providerState(user) === 'confirmed_active'
      : ['confirmed_active', 'confirmed_banned'].includes(providerState(user)))
  );
}
function receipt(
  value: unknown,
  input: EmployeeRestorationInput,
  operationId: string,
  managedName: string | null
) {
  let parsed: ReturnType<typeof ReceiptSchema.safeParse>;
  try {
    parsed = ReceiptSchema.safeParse(value);
  } catch {
    return null;
  }
  if (
    !parsed.success ||
    parsed.data.id !== input.targetUserId ||
    parsed.data.email !== input.confirmationEmail ||
    parsed.data.operationId !== operationId ||
    parsed.data.revision !== input.expectedRevision + 1 ||
    parsed.data.displayName !== managedName
  )
    return null;
  return {
    status: 'restored' as const,
    account: {
      id: parsed.data.id,
      email: parsed.data.email,
      displayName: parsed.data.displayName,
    },
    operationId,
    revision: parsed.data.revision,
  };
}
function validate(input: EmployeeRestorationInput) {
  if (
    !z.uuid().safeParse(input.targetUserId).success ||
    !RestoreInputSchema.safeParse({
      confirmationEmail: input.confirmationEmail,
      expectedRevision: input.expectedRevision,
    }).success ||
    input.expectedRevision === Number.MAX_SAFE_INTEGER
  )
    throw new EmployeeManagementError('invalid_employee_input', 400);
}
function restoreTuple(
  input: EmployeeRestorationInput,
  operationId: string
): EmployeeRestoreTuple {
  return {
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    email: input.confirmationEmail,
    expectedRevision: input.expectedRevision,
    operationId,
  };
}

/** Caller must freshly authenticate/authorize the root administrator and supply
 * trusted actor/provider/operations plus strict HTTP input. These preconditions
 * are not authority proof. The later SQL adapter must repeat locked checks.
 */
export async function restoreEmployeeAccess(input: EmployeeRestorationInput) {
  validate(input);
  await assertEmployeeServiceActor(input);
  const user = await readEmployeeProvider(input);
  const inspection = await inspectEmployeeManagement(input, user);
  if (
    !user &&
    inspection.registryState === 'absent' &&
    inspection.reservation === 'none'
  )
    throw new EmployeeManagementError('employee_not_found', 404);
  if (inspection.email !== input.confirmationEmail)
    throw new EmployeeManagementError('employee_confirmation_mismatch', 400);
  if (
    !boundProvider(user, input, false) ||
    !inspection.managed ||
    inspection.registryState !== 'active' ||
    !inspection.mailboxReady ||
    inspection.readinessCode !== 'ready' ||
    inspection.reservation === 'conflicting_tuple'
  )
    throw new EmployeeManagementError('employee_restoration_not_ready', 409);
  if (
    inspection.revision !== input.expectedRevision ||
    (inspection.operation && inspection.operation.phase !== 'completed')
  )
    throw new EmployeeManagementError(
      'employee_revision_or_operation_conflict',
      409
    );
  const operationId = randomUUID();
  const args = Object.freeze(restoreTuple(input, operationId));
  // Lost begin acknowledgement cannot authorize a provider write. The proposed
  // operation id is retained for inspection even when its persistence is unknown.
  let begun: unknown;
  try {
    begun = await employeeAcknowledgement(() => input.operations.begin(args));
  } catch (error) {
    if (error instanceof EmployeeManagementError && error.status !== 503)
      throw error;
    return pending(operationId);
  }
  let reservation: ReturnType<typeof OperationSchema.safeParse>;
  try {
    reservation = OperationSchema.safeParse(begun);
  } catch {
    return pending(operationId);
  }
  if (
    !reservation.success ||
    reservation.data.operationId !== operationId ||
    reservation.data.revision !== input.expectedRevision ||
    reservation.data.phase !== 'reserved'
  )
    return pending(operationId);
  if (providerState(user) === 'confirmed_banned') {
    try {
      const attempted = OperationSchema.safeParse(
        await employeeAcknowledgement(() => input.operations.markAttempt(args))
      );
      if (
        !attempted.success ||
        attempted.data.operationId !== operationId ||
        attempted.data.revision !== input.expectedRevision ||
        attempted.data.phase !== 'attempted'
      )
        return pending(operationId);
      // Exactly one supported provider write. No retry or compensation.
      const update = await employeeStep(() =>
        input.provider.updateUserById(input.targetUserId, {
          ban_duration: 'none',
        })
      );
      if (update.error || !boundProvider(update.data.user, input, true))
        return pending(operationId);
    } catch {
      return pending(operationId);
    }
  }
  try {
    const current = await readEmployeeProvider(input);
    if (!boundProvider(current, input, true))
      return pending(operationId, false);
    return (
      receipt(
        await employeeAcknowledgement(() => input.operations.confirm(args)),
        input,
        operationId,
        inspection.managedName
      ) ?? pending(operationId)
    );
  } catch {
    return pending(operationId);
  }
}
export async function reconcileEmployeeAccess(
  input: EmployeeRestorationInput & { operationId?: string }
) {
  validate(input);
  if (
    input.operationId !== undefined &&
    !z.uuid().safeParse(input.operationId).success
  )
    throw new EmployeeManagementError('invalid_employee_input', 400);
  await assertEmployeeServiceActor(input);
  // Inspection never begins or relaunches an operation, including after a crash
  // between the durable attempt marker and the provider request.
  let user: EmployeeProviderUser | null;
  try {
    user = await readEmployeeProvider(input);
  } catch (error) {
    if (error instanceof EmployeeManagementError && error.status !== 503)
      throw error;
    if (input.operationId) return pending(input.operationId);
    throw error;
  }
  let inspection: Inspection;
  try {
    inspection = await inspectEmployeeManagement(input, user);
  } catch (error) {
    if (error instanceof EmployeeManagementError && error.status !== 503)
      throw error;
    if (input.operationId) return pending(input.operationId);
    throw error;
  }
  if (
    !user &&
    inspection.registryState === 'absent' &&
    inspection.reservation === 'none' &&
    !input.operationId
  )
    throw new EmployeeManagementError('employee_not_found', 404);
  if (inspection.email !== input.confirmationEmail)
    throw new EmployeeManagementError('employee_confirmation_mismatch', 400);
  if (input.operationId) {
    const operationId = input.operationId;
    try {
      if (!boundProvider(user, input, true))
        return pending(input.operationId, false);
      return (
        receipt(
          await employeeAcknowledgement(() =>
            input.operations.reconcile(restoreTuple(input, operationId))
          ),
          input,
          input.operationId,
          inspection.managedName
        ) ?? pending(input.operationId)
      );
    } catch (error) {
      if (error instanceof EmployeeManagementError && error.status !== 503)
        throw error;
      return pending(input.operationId);
    }
  }
  if (inspection.operation && inspection.operation.phase !== 'completed')
    return pending(inspection.operation.operationId, false);
  if (
    inspection.revision !== null &&
    inspection.revision !== input.expectedRevision
  )
    throw new EmployeeManagementError(
      'employee_revision_or_operation_conflict',
      409
    );
  return {
    status: 'observed' as const,
    observation: { ...inspection, providerState: providerState(user) },
    nextAction: employeeNextAction(
      inspection,
      providerState(user),
      user?.app_metadata?.employee_onboarding === true
    ),
  };
}
