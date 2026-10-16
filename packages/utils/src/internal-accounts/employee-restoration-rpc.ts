import 'server-only';
import { z } from 'zod';
import { createEmployeeManagementTransport } from './employee-management-rpc';
import {
  EmployeeManagementError,
  type EmployeeRestorationOperations,
  type EmployeeRestoreTuple,
  employeeAcknowledgement,
  InspectionSchema,
  OperationSchema,
  RevisionSchema,
  TupleSchema,
} from './employee-restoration-boundary';

const RestoreTupleSchema = z.strictObject({
  actorUserId: z.uuid(),
  targetUserId: z.uuid(),
  email: TupleSchema.shape.email,
  expectedRevision: RevisionSchema.max(Number.MAX_SAFE_INTEGER - 1),
  operationId: z.uuid(),
});
const ReceiptSchema = z.strictObject({
  ...TupleSchema.shape,
  displayName: z.string().min(1),
  operationId: z.uuid(),
  revision: RevisionSchema,
  status: z.literal('restored'),
});

/** Each write must be observed by a separate committed-state RPC. No retries. */
export function createEmployeeRestorationOperations(
  input: Parameters<typeof createEmployeeManagementTransport>[0] & {
    actorUserId: string;
    targetUserId: string;
  }
): EmployeeRestorationOperations {
  const { actorUserId, targetUserId } = input;
  const call = createEmployeeManagementTransport(input);
  const inspect: EmployeeRestorationOperations['inspect'] = async (args) => {
    const { actorUserId: actor, targetUserId: target, email } = args;
    if (actor !== actorUserId || target !== targetUserId)
      throw new EmployeeManagementError('employee_management_forbidden', 403);
    return call('inspect_employee_management', actor, {
      p_actor_id: actor,
      p_user_id: target,
      p_email: email,
    });
  };
  async function write(
    args: EmployeeRestoreTuple,
    phase: 'reserved' | 'attempted' | 'confirm' | 'reconcile'
  ) {
    // Parsing copies the tuple before the first await.
    const tuple = RestoreTupleSchema.parse(args);
    if (
      tuple.actorUserId !== actorUserId ||
      tuple.targetUserId !== targetUserId ||
      tuple.actorUserId === tuple.targetUserId ||
      tuple.email !== tuple.email.trim().toLowerCase()
    )
      throw new EmployeeManagementError('employee_management_forbidden', 403);
    const name =
      phase === 'reserved'
        ? 'begin_employee_restore'
        : phase === 'attempted'
          ? 'mark_employee_restore_attempt'
          : phase === 'confirm'
            ? 'confirm_employee_restore'
            : 'reconcile_employee_restore';
    const result = await employeeAcknowledgement(() =>
      call(name, actorUserId, {
        p_actor_id: actorUserId,
        p_user_id: targetUserId,
        p_email: tuple.email,
        p_expected_revision: tuple.expectedRevision,
        p_operation_id: tuple.operationId,
      })
    );
    const operation =
      phase === 'reserved' || phase === 'attempted'
        ? OperationSchema.parse(result)
        : ReceiptSchema.parse(result);
    if (
      operation.operationId !== tuple.operationId ||
      operation.revision !==
        tuple.expectedRevision + ('phase' in operation ? 0 : 1) ||
      ('phase' in operation && operation.phase !== phase) ||
      ('id' in operation &&
        (operation.id !== targetUserId || operation.email !== tuple.email))
    )
      throw new EmployeeManagementError('employee_management_unavailable');
    const observed = InspectionSchema.parse(
      await employeeAcknowledgement(() => inspect(tuple))
    );
    if (
      observed.id !== targetUserId ||
      observed.email !== tuple.email ||
      observed.registryState !== 'active' ||
      !observed.managed ||
      !observed.mailboxReady ||
      observed.readinessCode !== 'ready' ||
      observed.reservation === 'conflicting_tuple' ||
      observed.revision !== operation.revision ||
      observed.operation?.operationId !== tuple.operationId ||
      observed.operation.revision !== tuple.expectedRevision ||
      observed.operation.phase !==
        ('phase' in operation ? phase : 'completed') ||
      ('displayName' in operation &&
        observed.managedName !== operation.displayName)
    )
      throw new EmployeeManagementError('employee_management_unavailable');
    return { data: operation, error: null };
  }
  return {
    inspect,
    begin: (args) => write(args, 'reserved'),
    markAttempt: (args) => write(args, 'attempted'),
    confirm: (args) => write(args, 'confirm'),
    reconcile: (args) => write(args, 'reconcile'),
  };
}
