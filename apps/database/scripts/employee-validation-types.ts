import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../../packages/types/src/supabase.js';

declare const client: SupabaseClient<Database>;
const privateClient = client.schema('private');
const identity = { p_actor_id: '', p_user_id: '', p_email: '', p_name: '' };
privateClient.rpc('employee_creation_preflight', identity).then(({ data }) => {
  const result: boolean | null = data;
  return result;
});
privateClient.rpc('finalize_employee_creation', identity);
privateClient.rpc('confirm_employee_activation', {
  p_actor_id: '',
  p_user_id: '',
  p_email: '',
});
privateClient.rpc('employee_access_preflight', {
  p_actor_id: '',
  p_user_id: '',
  p_email: '',
  p_require_active: true,
});
privateClient.rpc('employee_inbound_mailbox', { p_email: '', p_domain_id: '' });
type Employee =
  Database['private']['Tables']['infrastructure_employees']['Row'];
type Intent = Database['private']['Tables']['employee_creation_intents']['Row'];
declare const employee: Employee;
declare const intent: Intent;
const name: string = employee.managed_name;
const recovery: string | null = employee.recovery_email;
const actor: string = intent.actor_id;
void [name, recovery, actor];
// Negative controls must become errors against the actual generated schema.
// @ts-expect-error No missing employee UUID argument.
privateClient.rpc('employee_creation_preflight', {
  p_actor_id: '',
  p_email: '',
  p_name: '',
});
privateClient.rpc('confirm_employee_activation', {
  p_actor_id: '',
  p_email: '',
  // @ts-expect-error Employee UUID is not a number.
  p_user_id: 1,
});
export type PublicEmployee =
  // @ts-expect-error Recovery metadata is not a public employee registry.
  Database['public']['Tables']['infrastructure_employees'];

// Current service RPC arguments are inferred from the generated private schema.
// This fixture is copied alone into actual-types; do not import app services.
type RestoreArgs =
  Database['private']['Functions']['begin_employee_restore']['Args'];
const restoreArgs: RestoreArgs = {
  p_actor_id: '',
  p_user_id: '',
  p_email: '',
  p_expected_revision: 0,
  p_operation_id: '',
};
privateClient.rpc('inspect_employee_management', {
  p_actor_id: '',
  p_user_id: '',
  p_email: '',
});
for (const rpc of [
  'begin_employee_restore',
  'mark_employee_restore_attempt',
  'confirm_employee_restore',
  'reconcile_employee_restore',
] as const) {
  privateClient.rpc(rpc, restoreArgs).then(({ data }) => {
    const receipt: Json | null = data;
    return receipt;
  });
}
type RestoreOperation =
  Database['private']['Tables']['employee_restore_operations']['Row'];
declare const operation: RestoreOperation;
const revision: number = employee.revision;
const originalRevision: number = operation.expected_revision;
const operationId: string = operation.operation_id;
const originatingActor: string = operation.actor_id;
void [revision, originalRevision, operationId, originatingActor];
// @ts-expect-error A named restoration requires its durable operation UUID.
privateClient.rpc('reconcile_employee_restore', {
  p_actor_id: '',
  p_user_id: '',
  p_email: '',
  p_expected_revision: 0,
});
privateClient.rpc('mark_employee_restore_attempt', {
  ...restoreArgs,
  // @ts-expect-error Original expected revision must remain numeric.
  p_expected_revision: '0',
});
export type PublicRestoreOperation =
  // @ts-expect-error Restoration receipts are never a public registry.
  Database['public']['Tables']['employee_restore_operations'];
