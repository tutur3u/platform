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

export type WorkspaceResolution =
  | { exists: false }
  | { exists: true; workspaceId: string };

export type ResolvedWorkspace = Extract<WorkspaceResolution, { exists: true }>;

const legacyWorkspaceMissingStatuses = new Set([401, 403, 404]);

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
      if (
        error instanceof InternalApiError &&
        (legacyWorkspaceMissingStatuses.has(error.status) ||
          (error.status === 500 &&
            error.message === 'Error fetching workspaces'))
      ) {
        return { exists: false };
      }

      throw error;
    }
  });
