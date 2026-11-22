import type { AppCoordinationTokenClaims } from '@tuturuuu/auth/app-coordination';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { validate as validateUUID } from 'uuid';

export const EXTERNAL_APP_WORKSPACE_MISMATCH_ERROR =
  'Token is not valid for this workspace';

type WorkspaceBindingClaims = Pick<
  AppCoordinationTokenClaims,
  'scopes' | 'workspace_id'
>;

function isWorkspaceHandleCandidate(value: string) {
  return /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/u.test(value);
}

/**
 * Resolves a route workspace segment (UUID, `internal`, `personal` or handle)
 * to the workspace UUID for `userId`. An unknown handle is returned as given,
 * so the caller's app-link and membership checks refuse it. Throws when the
 * user has no personal workspace.
 */
export async function normalizeExternalAppWorkspaceId({
  admin,
  userId,
  wsId,
}: {
  admin: TypedSupabaseClient;
  userId: string;
  wsId: string;
}) {
  const resolvedWorkspaceId = resolveWorkspaceId(wsId);

  if (resolvedWorkspaceId === ROOT_WORKSPACE_ID) {
    return ROOT_WORKSPACE_ID;
  }

  if (resolvedWorkspaceId.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    const { data, error } = await admin
      .from('workspaces')
      .select('id, workspace_members!inner(user_id, type)')
      .eq('personal', true)
      .eq('workspace_members.user_id', userId)
      .eq('workspace_members.type', 'MEMBER')
      .maybeSingle();

    if (error || !data?.id) {
      throw new Error('Personal workspace not found');
    }

    return data.id;
  }

  if (validateUUID(resolvedWorkspaceId)) {
    return resolvedWorkspaceId;
  }

  const handle = resolvedWorkspaceId.trim().toLowerCase();

  if (!isWorkspaceHandleCandidate(handle)) {
    return resolvedWorkspaceId;
  }

  const { data } = await admin
    .from('workspaces')
    .select('id')
    .eq('handle', handle)
    .maybeSingle();

  return data?.id ?? resolvedWorkspaceId;
}

/**
 * The exchange binds every `workspace:session` and external-project bearer to
 * the workspace it authorized, so such a bearer without `workspace_id` is not
 * one the exchange issued and is refused.
 */
function requiresWorkspaceBinding(scopes: readonly string[]) {
  return scopes.some(
    (scope) =>
      scope === 'workspace:session' || scope.startsWith('external-projects:')
  );
}

function tokenWorkspaceId(claims: WorkspaceBindingClaims) {
  return claims.workspace_id?.trim().toLowerCase() || null;
}

/**
 * Whether an external-app bearer may act on `workspaceId`, a resolved
 * workspace UUID. A bearer carrying `workspace_id` acts only on that
 * workspace. A bearer issued for scopes that bind no workspace (for example
 * `workspace:drive:read` requested without `workspace:session`) carries none
 * and stays limited by the route's app-link and membership checks.
 */
export function externalAppTokenAllowsWorkspace(
  claims: WorkspaceBindingClaims,
  workspaceId: string
) {
  const bound = tokenWorkspaceId(claims);
  if (!bound) return !requiresWorkspaceBinding(claims.scopes);
  return bound === workspaceId.trim().toLowerCase();
}

function workspaceMismatchResponse() {
  return NextResponse.json(
    { error: EXTERNAL_APP_WORKSPACE_MISMATCH_ERROR },
    { status: 403 }
  );
}

/** The 403 response for a bearer bound to another workspace, or null. */
export function rejectExternalAppTokenWorkspace(
  claims: WorkspaceBindingClaims,
  workspaceId: string
) {
  return externalAppTokenAllowsWorkspace(claims, workspaceId)
    ? null
    : workspaceMismatchResponse();
}

/**
 * Applies the workspace binding to a route whose params carry `wsId`. The
 * segment is resolved only when the bearer is bound, so unbound scope-only
 * bearers cost no lookup; a segment that cannot be resolved is refused.
 */
export async function rejectExternalAppRouteWorkspace({
  admin,
  claims,
  params,
}: {
  admin: TypedSupabaseClient;
  claims: WorkspaceBindingClaims & Pick<AppCoordinationTokenClaims, 'sub'>;
  params?: unknown;
}) {
  const resolvedParams = await Promise.resolve(params);
  const wsId =
    resolvedParams && typeof resolvedParams === 'object'
      ? (resolvedParams as { wsId?: unknown }).wsId
      : undefined;

  if (typeof wsId !== 'string' || !wsId.trim()) return null;
  if (!tokenWorkspaceId(claims)) {
    return requiresWorkspaceBinding(claims.scopes)
      ? workspaceMismatchResponse()
      : null;
  }

  let workspaceId: string;
  try {
    workspaceId = await normalizeExternalAppWorkspaceId({
      admin,
      userId: claims.sub,
      wsId,
    });
  } catch {
    return workspaceMismatchResponse();
  }

  return rejectExternalAppTokenWorkspace(claims, workspaceId);
}
