/**
 * Shared forwarded-auth workspace resolution for migrated dashboard routes.
 *
 * Mirrors the legacy shared-component flow `getWorkspace(id)` followed by
 * `notFound()` when missing: resolves the workspace under the authenticated
 * user's forwarded auth (RLS-respecting) and maps the legacy missing-workspace
 * statuses (401/403/404, plus the legacy 500 "Error fetching workspaces") to a
 * not-found result. Other errors propagate.
 */

import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  getWorkspace,
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { Workspace } from '@tuturuuu/types';

export type WorkspaceResolution =
  | { exists: false }
  | { exists: true; workspaceId: string };

export type ResolvedWorkspace = Extract<WorkspaceResolution, { exists: true }>;

export type FullWorkspaceResolution =
  | { exists: false }
  | { exists: true; workspace: Workspace };

export type ResolvedFullWorkspace = Extract<
  FullWorkspaceResolution,
  { exists: true }
>;

const legacyWorkspaceMissingStatuses = new Set([401, 403, 404]);

/**
 * Maps the legacy missing-workspace error surface (401/403/404, plus the
 * legacy 500 "Error fetching workspaces") to a not-found signal. Any other
 * error is treated as a genuine failure and propagated by the callers.
 */
function isLegacyMissingWorkspaceError(error: unknown): boolean {
  return (
    error instanceof InternalApiError &&
    (legacyWorkspaceMissingStatuses.has(error.status) ||
      (error.status === 500 && error.message === 'Error fetching workspaces'))
  );
}

export const resolveWorkspace = createServerFn({ method: 'GET' })
  .validator((data: { wsId: string }) => data)
  .handler(async ({ data }): Promise<WorkspaceResolution> => {
    try {
      const workspace = await getWorkspace(
        data.wsId,
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      if (!workspace?.id) {
        return { exists: false };
      }

      return { exists: true, workspaceId: workspace.id };
    } catch (error) {
      if (isLegacyMissingWorkspaceError(error)) {
        return { exists: false };
      }

      throw error;
    }
  });

/**
 * Forwarded-auth resolver that returns the FULL workspace row (not just the
 * id), for routes whose shared component needs typed workspace settings such
 * as `timezone`, `first_day_of_week`, `creator_id`, or `personal` (e.g. the
 * calendar shell). `getWorkspace` already returns the complete `Workspace`
 * row, so this only widens what `resolveWorkspace` narrows away — same RLS,
 * same missing-workspace mapping.
 */
export const resolveFullWorkspace = createServerFn({ method: 'GET' })
  .validator((data: { wsId: string }) => data)
  .handler(async ({ data }): Promise<FullWorkspaceResolution> => {
    try {
      const workspace = await getWorkspace(
        data.wsId,
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      if (!workspace?.id) {
        return { exists: false };
      }

      return { exists: true, workspace };
    } catch (error) {
      if (isLegacyMissingWorkspaceError(error)) {
        return { exists: false };
      }

      throw error;
    }
  });
