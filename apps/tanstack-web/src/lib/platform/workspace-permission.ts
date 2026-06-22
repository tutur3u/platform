/**
 * Forwarded-auth workspace permission gate for migrating permission-gated
 * legacy dashboard pages into apps/tanstack-web (TanStack Start).
 *
 * Mirrors the legacy shared-component gate:
 *
 *   const { withoutPermission } = await getPermissions({ wsId });
 *   if (withoutPermission('manage_projects')) redirect(`/${wsId}`);
 *
 * Instead of re-implementing the permission resolution (admin queries over
 * workspace_role_members / default permissions / creator), this forwards the
 * request auth to internal-api `checkWorkspacePermission`, which calls
 * `/api/v1/workspaces/:wsId/settings/permissions/check` under the user's
 * session (RLS-respecting) and returns `{ hasPermission }`.
 *
 * Fail-closed: `hasWorkspacePermission` never throws and resolves to `false`
 * (deny) on any error or non-true response, so the gate denies access by
 * default.
 */

import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  checkWorkspacePermission,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { defaultLocale } from './locale';

/**
 * Fail-closed permission check. Returns `true` only when internal-api confirms
 * the authenticated caller holds `permission` in `wsId`; any error or non-true
 * response resolves to `false` (deny).
 */
export const hasWorkspacePermission = createServerFn({ method: 'GET' })
  .validator((data: { wsId: string; permission: string }) => data)
  .handler(async ({ data }): Promise<boolean> => {
    try {
      const result = await checkWorkspacePermission(
        data.wsId,
        data.permission,
        undefined,
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      return result?.hasPermission === true;
    } catch {
      return false;
    }
  });

/**
 * Loader convenience gate: throws a 307 redirect to the locale-prefixed
 * workspace dashboard (`/$locale/$wsId`) when the caller lacks `permission`,
 * mirroring the legacy `withoutPermission(...) -> redirect(`/${wsId}`)`.
 *
 * The thrown `redirect(...)` is TanStack Start's control-flow object and must
 * be re-thrown (not returned), matching the route loader convention.
 */
export async function requireWorkspacePermission(args: {
  wsId: string;
  permission: string;
  locale: string;
}): Promise<void> {
  const allowed = await hasWorkspacePermission({
    data: { wsId: args.wsId, permission: args.permission },
  });

  if (!allowed) {
    const safeLocale =
      typeof args.locale === 'string' && args.locale.trim().length > 0
        ? args.locale.trim()
        : defaultLocale;

    throw redirect({
      href: `/${safeLocale}/${args.wsId}`,
      statusCode: 307,
    });
  }
}
