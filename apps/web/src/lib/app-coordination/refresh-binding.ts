import { verifyAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import type { NextResponse } from 'next/server';
import {
  externalAppWorkspaceRequiredResponse,
  workspaceBoundSignInRequired,
} from './external-app-workspace';
import {
  APP_TOKEN_REFRESH_SCOPE,
  BOUND_ON_REFRESH_SCOPE,
} from './refresh-family';

/**
 * Last instant a refresh token without a workspace can be bound on refresh:
 * one refresh-family lifetime after strict binding, 2026-12-23 23:59 ICT.
 * From it such a token is refused and the user signs in again.
 */
export const BIND_ON_REFRESH_SUNSET = new Date('2026-12-23T23:59:00+07:00');

export { workspaceBoundSignInRequired } from './external-app-workspace';

export type RefreshBinding =
  | { refusal: NextResponse }
  | {
      /** The refresh binds a token issued without a workspace. */
      bindOnRefresh: boolean;
      /** The rotated refresh token carries `BOUND_ON_REFRESH_SCOPE`. */
      boundOnRefresh: boolean;
    };

/**
 * Decides how a refresh treats the presented token's workspace, before the
 * single-use token is consumed, so a refusal never burns it. A token whose
 * `workspace_id` is missing or empty counts as unbound.
 *
 * External-project scopes are never granted to a refresh token without a
 * workspace, nor to a family bound on refresh. An unbound token is bound on
 * refresh whenever the request names `workspaceId`, for every app: the
 * exchange then runs the workspace session checks and mints a bound bearer
 * and a bound, rotated refresh token that carries `BOUND_ON_REFRESH_SCOPE`.
 * Without `workspaceId`, strict binding (`requiresWorkspace`) answers 400
 * `WORKSPACE_ID_REQUIRED` so the client retries with one, while an app exempt
 * from it keeps an unbound refresh. From the sunset both answer 401.
 */
export function checkRefreshBinding({
  now = new Date(),
  refreshToken,
  requiresWorkspace,
  scopes,
  workspaceId,
}: {
  now?: Date;
  refreshToken: string;
  requiresWorkspace: boolean;
  scopes: readonly string[];
  workspaceId?: string;
}): RefreshBinding {
  let verification: ReturnType<typeof verifyAppCoordinationToken>;
  try {
    verification = verifyAppCoordinationToken(refreshToken);
  } catch {
    verification = { error: 'invalid', ok: false };
  }
  // A token that is not a valid refresh token is refused where it is consumed.
  if (
    !verification.ok ||
    !verification.claims.scopes.includes(APP_TOKEN_REFRESH_SCOPE)
  ) {
    return { bindOnRefresh: false, boundOnRefresh: false };
  }

  const { claims } = verification;
  const marked = claims.scopes.includes(BOUND_ON_REFRESH_SCOPE);
  const externalProjects = scopes.some((scope) =>
    scope.startsWith('external-projects:')
  );

  if (claims.workspace_id) {
    return marked && externalProjects
      ? { refusal: workspaceBoundSignInRequired() }
      : { bindOnRefresh: false, boundOnRefresh: marked };
  }
  if (externalProjects) return { refusal: workspaceBoundSignInRequired() };
  const named = Boolean(workspaceId?.trim());
  // An app exempt from strict binding may still refresh without a workspace.
  if (!requiresWorkspace && !named) {
    return { bindOnRefresh: false, boundOnRefresh: marked };
  }
  if (now.getTime() >= BIND_ON_REFRESH_SUNSET.getTime()) {
    return { refusal: workspaceBoundSignInRequired() };
  }
  if (!named) return { refusal: externalAppWorkspaceRequiredResponse() };
  // Every refresh that binds an unbound token, for any app, is a bind on
  // refresh: the family is marked and a grace retry cannot bind it again.
  return { bindOnRefresh: true, boundOnRefresh: true };
}

/** Counts refreshes bound on refresh; app id only, no user data. */
export function logBoundOnRefresh(targetApp: string) {
  console.info('[external-app-refresh] bound an unbound refresh token', {
    targetApp,
  });
}
