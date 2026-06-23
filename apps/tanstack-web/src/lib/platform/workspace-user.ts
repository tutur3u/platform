/**
 * Forwarded-auth resolver for the current caller's workspace-user link.
 *
 * Several user-scoped legacy pages call `getCurrentWorkspaceUser(wsId)` to read
 * the caller's `virtual_user_id` before rendering (group reports, indicators,
 * topic announcements, etc.). That helper reads Supabase directly and cannot
 * run in apps/tanstack-web, so this forwards the request auth to the internal
 * `GET /api/v1/workspaces/:wsId/users/me` reader (RLS-respecting) and returns
 * the link, or `null` when the caller has none (mirroring the legacy
 * `notFound()` path the caller drives off a null result).
 */

import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  type CurrentWorkspaceUserLink,
  getCurrentWorkspaceUserLink,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';

export type CurrentWorkspaceUserResolution =
  | { exists: false }
  | { exists: true; user: CurrentWorkspaceUserLink };

export const resolveCurrentWorkspaceUser = createServerFn({ method: 'GET' })
  .validator((data: { wsId: string }) => data)
  .handler(async ({ data }): Promise<CurrentWorkspaceUserResolution> => {
    const user = await getCurrentWorkspaceUserLink(
      data.wsId,
      withForwardedInternalApiAuth(getRequestHeaders())
    );

    if (!user) {
      return { exists: false };
    }

    return { exists: true, user };
  });
