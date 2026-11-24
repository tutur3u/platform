import type { AbuseGuardBinding } from '@tuturuuu/utils/abuse-guard/client';
import { configureAbuseGuardRuntime } from '@tuturuuu/utils/abuse-guard/select';
import type { WorkspaceSecretsBinding } from '@tuturuuu/utils/workspace-secrets/protocol';
import { configureWorkspaceSecretsRuntime } from '@tuturuuu/utils/workspace-secrets/runtime';

type InfrastructureAbuseGuardEnv = {
  ABUSE_GUARD?: AbuseGuardBinding;
  ABUSE_GUARD_KEY_PEPPER?: string;
  ABUSE_GUARD_FAMILIES?: string;
  ABUSE_GUARD_TIMEOUT_MS?: string;
  WORKSPACE_SECRETS?: WorkspaceSecretsBinding;
};

/**
 * Installs the Worker's ABUSE_GUARD binding and, when bound, its
 * WORKSPACE_SECRETS binding (the AdminSecrets entrypoint of
 * tuturuuu-workspace-secrets) for this request.
 */
export function configureInfrastructureAbuseGuard(env: object) {
  const guard = env as InfrastructureAbuseGuardEnv;
  configureWorkspaceSecretsRuntime(guard.WORKSPACE_SECRETS ?? null);
  configureAbuseGuardRuntime(
    guard.ABUSE_GUARD
      ? {
          binding: guard.ABUSE_GUARD,
          pepper: guard.ABUSE_GUARD_KEY_PEPPER,
          families: guard.ABUSE_GUARD_FAMILIES,
          timeoutMs: guard.ABUSE_GUARD_TIMEOUT_MS,
        }
      : null
  );
}
