import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import {
  getPermissions,
  getWorkspace,
  type PermissionsResult,
} from '@tuturuuu/utils/workspace-helper';

export type FormsWorkspace = NonNullable<
  Awaited<ReturnType<typeof getWorkspace>>
>;

/**
 * Satellite-aware workspace/permission resolution for apps/forms.
 *
 * The shared `getWorkspace(id)` / `getPermissions({ wsId })` helpers fall back
 * to a cookie-backed Supabase client when no `user` is supplied. That works in
 * apps/web, where the Supabase auth cookie is present — but a satellite
 * authenticates with a Tuturuuu app-session JWT instead, so the fallback
 * resolves an ANONYMOUS client. The workspace lookup then returns null and the
 * page 404s (`Workspace not found: personal`), while the in-flight Supabase
 * fetches outlive the aborted render and surface as HANGING_PROMISE_REJECTION.
 *
 * Always resolve the actor from the app session first and pass it through.
 */
export async function getFormsWorkspace(
  id: string
): Promise<FormsWorkspace | null> {
  const user = await getSatelliteAppSessionUser('forms');

  if (!user?.id) {
    return null;
  }

  return getWorkspace(id, { useAdmin: true, user });
}

export async function getFormsWorkspacePermissions(
  wsId: string
): Promise<PermissionsResult | null> {
  const user = await getSatelliteAppSessionUser('forms');

  if (!user?.id) {
    return null;
  }

  return getPermissions({ user, wsId });
}
