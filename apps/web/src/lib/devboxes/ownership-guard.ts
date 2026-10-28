import {
  type DevboxPrivateSchemaClient,
  getDevboxStorageError,
} from './store-utils';

export async function assertDevboxWriteOwnership(
  client: DevboxPrivateSchemaClient,
  input: {
    actorId: string;
    leaseId?: string;
    runnerId?: string;
    workload?: string;
  }
) {
  if (!input.leaseId && !input.runnerId) return;
  const { error } = await client.rpc('check_devbox_write_ownership', {
    p_actor_id: input.actorId,
    p_lease_id: input.leaseId ?? null,
    p_runner_id: input.runnerId ?? null,
    p_workload: input.workload ?? 'run',
  });
  if (!error) return;
  throw getDevboxStorageError(error);
}
