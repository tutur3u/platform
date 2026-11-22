import {
  expandWildcardScopes,
  getAllowedAppTokenScopes,
} from '@tuturuuu/utils/external-app-registry-policy';
import { isWorkspaceRouteScope } from './external-app-workspace';

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

/** The token scopes for an app's grant, with `workspace:session` inferred. */
export function getAllowedAppTokenScopesWithWorkspaceSession({
  allowedScopes,
  allowedWorkspaceIds,
  requestedScopes,
  workspaceId,
}: {
  allowedScopes: string[];
  allowedWorkspaceIds: string[];
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
    return scopes;
  }

  return [...new Set([...scopes, WORKSPACE_SESSION_SCOPE])].sort();
}
