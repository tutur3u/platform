import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  getWorkspace,
  type PermissionsResult,
} from '@tuturuuu/utils/workspace-helper';
import { getWorkspaceUserLinkForUser } from '@tuturuuu/utils/workspace-user-link';
import { cache } from 'react';

export type ContactsWorkspace = NonNullable<
  Awaited<ReturnType<typeof getWorkspace>>
>;
export type ContactsActor = NonNullable<
  Awaited<ReturnType<typeof getSatelliteAppSessionUser>>
>;

/**
 * Satellite-aware workspace/permission resolution for apps/contacts.
 *
 * The shared `getWorkspace(id)` / `getPermissions({ wsId })` helpers fall back
 * to a cookie-backed Supabase client when no `user` is supplied. That works in
 * apps/web, where the Supabase auth cookie is present — but a satellite
 * authenticates with a Tuturuuu app-session JWT instead, so the fallback
 * resolves an ANONYMOUS client. The workspace lookup then returns null and the
 * page 404s (`Workspace not found: personal`), while the in-flight Supabase
 * fetches outlive the aborted render and surface as HANGING_PROMISE_REJECTION.
 *
 * Always resolve the actor from the app session first and pass it through, the
 * same way apps/finance, apps/drive, and apps/calendar do.
 */
export async function getContactsWorkspace(
  id: string
): Promise<ContactsWorkspace | null> {
  const user = await getSatelliteAppSessionUser('contacts');

  if (!user?.id) {
    return null;
  }

  return getWorkspace(id, { useAdmin: true, user });
}

export async function getContactsWorkspacePermissions(
  wsId: string,
  actor?: ContactsActor
): Promise<PermissionsResult | null> {
  const user = actor ?? (await getSatelliteAppSessionUser('contacts'));

  if (!user?.id) {
    return null;
  }

  // Contacts permissions authorize the workspace, while most Contacts data is
  // scoped through workspace_user_linked_users. Repair that profile first so a
  // newly invited or historically incomplete member cannot pass permission
  // checks and then receive an empty module or page-level 404.
  const linkedUser = await getContactsWorkspaceUserLink(wsId, user);
  if (!linkedUser) return null;

  return getPermissions({ user, wsId });
}

export async function getContactsWorkspaceUserLink(
  wsId: string,
  actor?: ContactsActor
) {
  const user = actor ?? (await getSatelliteAppSessionUser('contacts'));

  if (!user?.id) {
    return null;
  }

  const sbAdmin = await createAdminClient({ noCookie: true });
  return getWorkspaceUserLinkForUser(wsId, user.id, {
    authorizationClient: sbAdmin,
  });
}

async function resolveContactsWorkspaceAccess(wsId: string) {
  const actor = await getSatelliteAppSessionUser('contacts');
  if (!actor?.id) return null;

  const user = await getContactsWorkspaceUserLink(wsId, actor);
  if (!user) return null;

  const permissions = await getPermissions({ user: actor, wsId });
  if (!permissions) return null;

  return { actor, permissions, user };
}

/**
 * One request-scoped access result shared by the Contacts layout and page.
 * React cache prevents parallel route segments from racing independent repair
 * and permission reads for the same workspace.
 */
export const getContactsWorkspaceAccess = cache(async (wsId: string) =>
  resolveContactsWorkspaceAccess(wsId)
);
