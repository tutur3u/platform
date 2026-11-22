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

type WorkspaceBindingClaims = Pick<AppCoordinationTokenClaims, 'workspace_id'>;

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

/** Workspace route scopes: `workspace:*` and `workspace.*` grants. */
export function isWorkspaceRouteScope(scope: string) {
  return scope.startsWith('workspace:') || scope.startsWith('workspace.');
}

/**
 * Whether a token for `scopes` must carry `workspace_id`. The exchange binds
 * every workspace route and external-project token to the workspace it
 * authorized and refuses to mint one without it.
 */
export function requiresExternalAppWorkspaceBinding(scopes: readonly string[]) {
  return scopes.some(
    (scope) =>
      isWorkspaceRouteScope(scope) || scope.startsWith('external-projects:')
  );
}

export const EXTERNAL_APP_WORKSPACE_REQUIRED_CODE = 'WORKSPACE_ID_REQUIRED';

/** The exchange's 400 for workspace scopes requested without `workspaceId`. */
export function externalAppWorkspaceRequiredResponse() {
  return NextResponse.json(
    {
      code: EXTERNAL_APP_WORKSPACE_REQUIRED_CODE,
      error: 'Workspace ID is required for workspace scopes',
    },
    { status: 400 }
  );
}

function tokenWorkspaceId(claims: WorkspaceBindingClaims) {
  return claims.workspace_id?.trim().toLowerCase() || null;
}

/**
 * Whether an external-app bearer may act on `workspaceId`, a resolved
 * workspace UUID. Only a bearer bound to that workspace may; one without
 * `workspace_id` acts on no workspace.
 */
export function externalAppTokenAllowsWorkspace(
  claims: WorkspaceBindingClaims,
  workspaceId: string
) {
  const bound = tokenWorkspaceId(claims);
  return bound !== null && bound === workspaceId.trim().toLowerCase();
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
 * Applies the workspace binding to a route whose params carry `wsId`. An
 * unbound bearer is refused without a lookup, and a segment that cannot be
 * resolved is refused.
 */
export async function rejectExternalAppRouteWorkspace({
  admin,
  claims,
  params,
}: {
  admin: TypedSupabaseClient;
  claims: Pick<AppCoordinationTokenClaims, 'sub' | 'workspace_id'>;
  params?: unknown;
}) {
  const resolvedParams = await Promise.resolve(params);
  const wsId =
    resolvedParams && typeof resolvedParams === 'object'
      ? (resolvedParams as { wsId?: unknown }).wsId
      : undefined;

  if (typeof wsId !== 'string' || !wsId.trim()) return null;
  if (!tokenWorkspaceId(claims)) return workspaceMismatchResponse();

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
