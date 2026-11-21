import {
  asPrivateRpcAdmin,
  commitPlatformFeatureFlagMutation,
  interpretAdminAuditRead,
  interpretAdminStateRead,
  type MutationCommand,
  type PrivateRpcAdmin,
} from '@tuturuuu/feature-flags';

export { asPrivateRpcAdmin };

export async function commitPlatformFeatureFlag(input: {
  admin: PrivateRpcAdmin;
  command: MutationCommand;
}) {
  return commitPlatformFeatureFlagMutation({
    allowActor: () => true,
    call: () =>
      input.admin.schema('private').rpc('platform_feature_flag_mutate', {
        p_actor: input.command.actorId,
        p_environment: input.command.environment,
        p_expected_revision: input.command.expectedRevision,
        p_flag_key: input.command.flagKey,
        p_operation_id: input.command.operationId,
        p_override_enabled: input.command.overrideEnabled,
      }),
    command: input.command,
  });
}

export async function readPlatformFeatureFlagState(input: {
  actorId: string;
  admin: PrivateRpcAdmin;
}) {
  try {
    return interpretAdminStateRead(
      await input.admin
        .schema('private')
        .rpc('platform_feature_flag_read_state', {
          p_actor: input.actorId,
        })
    );
  } catch {
    return { status: 'unavailable' as const };
  }
}

export async function readPlatformFeatureFlagAudit(input: {
  actorId: string;
  admin: PrivateRpcAdmin;
  before?: string | null;
  limit: number;
  operationId?: string | null;
}) {
  try {
    return interpretAdminAuditRead(
      await input.admin
        .schema('private')
        .rpc('platform_feature_flag_read_audit', {
          p_actor: input.actorId,
          p_before: input.before ?? null,
          p_limit: input.limit,
          p_operation_id: input.operationId ?? null,
        })
    );
  } catch {
    return { status: 'unavailable' as const };
  }
}
