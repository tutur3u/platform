import {
  expandWildcardScopes,
  getAllowedAppTokenScopes,
} from '@tuturuuu/utils/external-app-registry-policy';
import {
  isWorkspaceRouteScope,
  requiresExternalAppWorkspaceBinding,
} from './external-app-workspace';
import { isExternalAppStrictBinding } from './strict-binding';

const WORKSPACE_SESSION_SCOPE = 'workspace:session';

/**
 * Whether the exchange runs the workspace session checks (linked app, direct
 * MEMBER, pending invitations). With `bindWorkspaceScopes` every workspace
 * route scope needs them; otherwise only `workspace:session` does.
 */
export function requiresWorkspaceSessionAuthorization(
  scopes: string[],
  bindWorkspaceScopes: boolean
) {
  return bindWorkspaceScopes
    ? scopes.some(isWorkspaceRouteScope)
    : scopes.includes(WORKSPACE_SESSION_SCOPE);
}

function shouldInferWorkspaceSessionScope({
  allowedWorkspaceIds,
  requestedScopes,
  workspaceId,
}: {
  allowedWorkspaceIds: string[];
  requestedScopes: string[];
  workspaceId?: string;
}) {
  const requestedWorkspaceSession = requestedScopes.includes(
    WORKSPACE_SESSION_SCOPE
  );

  return (
    allowedWorkspaceIds.length > 0 &&
    (requestedWorkspaceSession ||
      (requestedScopes.length === 0 && Boolean(workspaceId?.trim())))
  );
}

/**
 * The token scopes for an app's grant, with `workspace:session` inferred.
 *
 * A token sign-in (not a refresh) that names no workspace and requests no
 * scopes is an identity sign-in (for example EduFest's player sign-in): pass
 * `identitySignInAppId` for it. Under strict binding it gets
 * only the app's non-workspace scopes, so it is never handed workspace or
 * external-project scopes it would have to be refused for. Before, the app's
 * whole default grant was taken and the exchange answered 400
 * `WORKSPACE_ID_REQUIRED`. Refreshes keep their behaviour: a bound refresh
 * token keeps its grant and an unbound one still gets the 400, then the
 * bind-on-refresh sunset. Explicit requests, workspace-bound exchanges and
 * apps exempt from strict binding are unchanged too.
 */
export function getAllowedAppTokenScopesWithWorkspaceSession({
  allowedScopes,
  allowedWorkspaceIds,
  identitySignInAppId,
  requestedScopes,
  workspaceId,
}: {
  allowedScopes: string[];
  allowedWorkspaceIds: string[];
  /** The app id, only for a token sign-in; omit it for a refresh. */
  identitySignInAppId?: string;
  requestedScopes: string[];
  workspaceId?: string;
}) {
  const inferWorkspaceSession = shouldInferWorkspaceSessionScope({
    allowedWorkspaceIds,
    requestedScopes,
    workspaceId,
  });
  const requestedApiScopes = inferWorkspaceSession
    ? requestedScopes.filter((scope) => scope !== WORKSPACE_SESSION_SCOPE)
    : requestedScopes;
  // Issued tokens never carry a literal wildcard.
  const scopes = expandWildcardScopes(
    getAllowedAppTokenScopes({
      allowedScopes,
      requestedScopes: requestedApiScopes,
    })
  );

  if (!inferWorkspaceSession) {
    const identitySignIn =
      requestedScopes.length === 0 &&
      !workspaceId?.trim() &&
      !!identitySignInAppId &&
      isExternalAppStrictBinding(identitySignInAppId);
    return identitySignIn
      ? scopes.filter((scope) => !requiresExternalAppWorkspaceBinding([scope]))
      : scopes;
  }

  return [...new Set([...scopes, WORKSPACE_SESSION_SCOPE])].sort();
}
