import {
  createInternalEmployee,
  createJournaledInternalEmployee,
  EmployeeRestorationConsumer,
  restoreInternalEmployee,
} from '@tuturuuu/internal-api/infrastructure';
import type { Database } from '@tuturuuu/types/supabase';

// This is compiled only; no request or identity is created by this fixture.
export function employeePublicContract(
  actorId: string,
  targetId: string,
  operationId: string,
  expectedRevision: number,
  payload: Parameters<typeof createInternalEmployee>[0]
) {
  void createInternalEmployee(payload, { operationId });
  void createJournaledInternalEmployee(payload, { operationId });
  void restoreInternalEmployee(targetId, {
    confirmationEmail: payload.email,
    expectedRevision,
  });
  const consumer = new EmployeeRestorationConsumer({
    targetId,
    email: payload.email,
    assertActive() {},
  });
  type Private = Database['private'];
  type CreateArgs =
    Private['Functions']['employee_creation_operation_claim']['Args'];
  type RestoreArgs = Private['Functions']['begin_employee_restore']['Args'];
  type RestoreRow = Pick<
    Private['Tables']['employee_restore_operations']['Row'],
    'operation_id' | 'expected_revision'
  >;
  const create = {
    p_actor_id: actorId,
    p_email: payload.email,
    p_name: payload.displayName,
    p_operation_id: operationId,
  } satisfies CreateArgs;
  const { p_operation_id: _createOperation, ...missingCreateOperation } =
    create;
  // @ts-expect-error Generated CREATE requires its operation UUID.
  const missingCreate: CreateArgs = missingCreateOperation;
  const restore = {
    p_actor_id: actorId,
    p_user_id: targetId,
    p_email: payload.email,
    p_expected_revision: expectedRevision,
    p_operation_id: operationId,
  } satisfies RestoreArgs;
  const finalize = {
    p_actor_id: actorId,
    p_user_id: targetId,
    p_email: payload.email,
    p_name: payload.displayName,
  } satisfies Private['Functions']['finalize_employee_creation']['Args'];
  const restoredOperation: RestoreRow = {
    operation_id: operationId,
    expected_revision: expectedRevision,
  };
  // @ts-expect-error Both public creation names require operation identity.
  void createInternalEmployee(payload);
  // @ts-expect-error The journaled name must retain the same required options.
  void createJournaledInternalEmployee(payload);
  // @ts-expect-error Empty options cannot supply operation identity.
  void createInternalEmployee(payload, {});
  // @ts-expect-error UUIDs are represented by strings, never numbers.
  void createJournaledInternalEmployee(payload, { operationId: 1 });
  // @ts-expect-error RESTORE must retain expected revision.
  void restoreInternalEmployee(targetId, { confirmationEmail: payload.email });
  void restoreInternalEmployee(targetId, {
    confirmationEmail: payload.email,
    // @ts-expect-error Revision must be numeric.
    expectedRevision: '1',
  });
  const { p_operation_id: _operation, ...missingOperation } = restore;
  // @ts-expect-error Generated private RESTORE args require the operation UUID.
  const missing: RestoreArgs = missingOperation;
  const { p_expected_revision: _revision, ...missingRevision } = restore;
  // @ts-expect-error Generated RESTORE revision is required.
  const revision: RestoreArgs = missingRevision;
  const invalidCreate = { ...create, p_operation_id: 1 };
  // @ts-expect-error Generated CREATE UUID cannot be numeric.
  const wrongCreate: CreateArgs = invalidCreate;
  const invalidRestore = { ...restore, p_expected_revision: '1' };
  // @ts-expect-error Generated RESTORE revision cannot be a string.
  const wrongRestore: RestoreArgs = invalidRestore;
  const invalidRow = { ...restoredOperation, operation_id: 1 };
  // @ts-expect-error Generated operation table UUID is a string.
  const wrongRow: RestoreRow = invalidRow;
  return {
    create,
    restore,
    finalize,
    consumer,
    restoredOperation,
    missingCreate,
    missing,
    revision,
    wrongCreate,
    wrongRestore,
    wrongRow,
  };
}

type PublicTables = Database['public']['Tables'];
type PublicFunctions = Database['public']['Functions'];
// @ts-expect-error Registry/journal data is private, not a public table.
export type PublicJournal = PublicTables['employee_restore_operations'];
// @ts-expect-error Employee RPCs must remain outside the public schema.
export type PublicRestore = PublicFunctions['begin_employee_restore'];
// @ts-expect-error Employee registry must stay private.
export type PublicRegistry = PublicTables['infrastructure_employees'];
