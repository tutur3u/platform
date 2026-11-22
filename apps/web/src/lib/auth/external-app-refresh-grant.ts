import type { AppCoordinationTokenClaims } from '@tuturuuu/auth/app-coordination';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { wasIssuedBeforeSecretRotation } from '@tuturuuu/utils/external-app-registry-policy';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import type { ExternalAppRegistration } from '@/lib/app-coordination/external-apps';
import { appTokenTargetMatchesExternalProjectBinding } from '@/lib/external-projects/app-binding';
import {
  EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
  EXTERNAL_PROJECT_ENABLED_SECRET,
} from '@/lib/external-projects/constants';

export type RefreshApp = Pick<
  ExternalAppRegistration,
  'allowedWorkspaceIds' | 'enabled' | 'id' | 'secretIssuedAt'
>;

/**
 * `revoked` is a positive determination that the grant ended; `unavailable`
 * means a lookup failed and nothing about the grant is known.
 */
export type RefreshGrant = 'live' | 'revoked' | 'unavailable';

function assertRead(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/**
 * Whether the workspace's external project binding links the app. Reads the
 * binding row, the legacy workspace secrets when no row exists, and the
 * canonical project. Unlike the delivery-side binding resolver, every failed
 * read throws, so an outage is never mistaken for an unlinked workspace.
 */
async function isLinkedByExternalProject(
  admin: TypedSupabaseClient,
  workspaceId: string,
  appId: string
) {
  const { data: binding, error: bindingError } = await admin
    .from('workspace_external_project_bindings')
    .select('canonical_project_id, is_enabled')
    .eq('ws_id', workspaceId)
    .maybeSingle();
  assertRead(bindingError);

  let canonicalId: string | null;
  let enabled: boolean;
  if (binding) {
    canonicalId = binding.canonical_project_id ?? null;
    enabled = binding.is_enabled === true;
  } else {
    const { data: secrets, error: secretsError } = await admin
      .from('workspace_secrets')
      .select('name, value')
      .eq('ws_id', workspaceId)
      .in('name', [
        EXTERNAL_PROJECT_ENABLED_SECRET,
        EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
      ]);
    assertRead(secretsError);
    canonicalId =
      secrets?.find(
        (secret) => secret.name === EXTERNAL_PROJECT_CANONICAL_ID_SECRET
      )?.value ?? null;
    enabled =
      secrets?.some(
        (secret) =>
          secret.name === EXTERNAL_PROJECT_ENABLED_SECRET &&
          secret.value === 'true'
      ) ?? false;
  }

  if (!enabled || !canonicalId) return false;

  const { data: project, error: projectError } = await admin
    .from('canonical_external_projects')
    .select('id, adapter, is_active')
    .eq('id', canonicalId)
    .maybeSingle();
  assertRead(projectError);

  return (
    project?.is_active === true &&
    appTokenTargetMatchesExternalProjectBinding({
      binding: { canonical_project: project },
      targetApp: appId,
    })
  );
}

/**
 * Re-checks Postgres-backed state a refresh token cannot carry: the app is
 * still enabled, the token postdates the app's current secret, and a bound
 * workspace still has the user as a direct MEMBER and still links the app,
 * through the registry's `allowedWorkspaceIds` (workspace sessions) or the
 * workspace's external project binding (external project scopes).
 */
export async function checkRefreshGrant(
  admin: TypedSupabaseClient,
  app: RefreshApp,
  claims: AppCoordinationTokenClaims
): Promise<RefreshGrant> {
  if (!app.enabled || app.id !== claims.target_app) return 'revoked';
  // An unreadable rotation time proves nothing about this token, and treating
  // it as a rotation would revoke every family of the app.
  if (app.secretIssuedAt && !Number.isFinite(Date.parse(app.secretIssuedAt))) {
    console.warn('External app secret issue time is unreadable', {
      targetApp: claims.target_app,
    });
    return 'unavailable';
  }
  if (wasIssuedBeforeSecretRotation(claims, app.secretIssuedAt)) {
    return 'revoked';
  }

  const workspaceId = claims.workspace_id;
  if (!workspaceId) return 'live';

  try {
    const membership = await verifyWorkspaceMembershipType({
      requiredType: 'MEMBER',
      supabase: admin,
      userId: claims.sub,
      wsId: workspaceId,
    });
    if (membership.error === 'membership_lookup_failed') return 'unavailable';
    if (!membership.ok) return 'revoked';
    if (app.allowedWorkspaceIds.includes(workspaceId.toLowerCase())) {
      return 'live';
    }

    return (await isLinkedByExternalProject(admin, workspaceId, app.id))
      ? 'live'
      : 'revoked';
  } catch (error) {
    console.warn('External app refresh grant check failed', {
      error: error instanceof Error ? error.message : String(error),
      targetApp: claims.target_app,
    });
    return 'unavailable';
  }
}
