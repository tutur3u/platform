import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  type ResolveUserDisplayNameOptions,
  resolveUserDisplayName,
  resolveUserFullName,
} from './name-helper';

/**
 * Co-member name resolution with an email fallback (USER decision D246).
 *
 * Workspace co-members may see each other's email ONLY as a name fallback:
 * display name -> full name -> email -> handle. The email is resolved on the
 * server and returned as the *name string*; callers never receive a separate
 * email field. Everything fails closed to the email-free name:
 *
 * - no workspace id, no viewer, or any lookup error;
 * - the workspace has HIDE_MEMBER_EMAIL = 'true' (no email) and/or
 *   HIDE_MEMBER_NAME = 'true' (no private full name);
 * - the viewer is not a MEMBER (guests and non-members never get emails);
 * - the target user is not a MEMBER of the same workspace.
 *
 * The private full name and email are read with the admin client from
 * `user_private_details`, only for target ids that passed every check and have
 * no display or full name in the caller's row. Order stays
 * display name -> full name -> email -> handle.
 */

export interface CoMemberNameSource {
  id: string | null | undefined;
  display_name?: string | null;
  displayName?: string | null;
  full_name?: string | null;
  fullName?: string | null;
  handle?: string | null;
  username?: string | null;
}

export interface ResolveCoMemberNamesInput {
  /** Admin (service-role) client. Required to read `user_private_details`. */
  admin: TypedSupabaseClient;
  /** The resolved workspace UUID the viewer is looking at. */
  wsId: string | null | undefined;
  /** The signed-in viewer; omit or pass null for anonymous/share-link views. */
  viewerUserId: string | null | undefined;
  users: readonly CoMemberNameSource[];
  /** Resolve the full-name slot instead of the display-name slot. */
  slot?: 'display' | 'full';
  options?: ResolveUserDisplayNameOptions;
}

export const HIDE_MEMBER_EMAIL_SECRET = 'HIDE_MEMBER_EMAIL';
export const HIDE_MEMBER_NAME_SECRET = 'HIDE_MEMBER_NAME';

export interface CoMemberPrivateName {
  /** Private full name (user_private_details), unless HIDE_MEMBER_NAME. */
  fullName?: string;
  /** Private email, unless HIDE_MEMBER_EMAIL. */
  email?: string;
}

function hasName(user: CoMemberNameSource) {
  const display = (user.display_name ?? user.displayName)?.trim();
  const full = (user.full_name ?? user.fullName)?.trim();
  return Boolean(display || full);
}

function uniqueIds(ids: readonly (string | null | undefined)[]) {
  return [...new Set(ids.filter((id): id is string => Boolean(id?.trim())))];
}

/**
 * Returns the private full name and/or email that may serve as a name
 * fallback for each target, for this viewer. Empty whenever a guard fails.
 */
export async function getCoMemberPrivateNames({
  admin,
  wsId,
  viewerUserId,
  userIds,
}: {
  admin: TypedSupabaseClient;
  wsId: string | null | undefined;
  viewerUserId: string | null | undefined;
  userIds: readonly (string | null | undefined)[];
}): Promise<Map<string, CoMemberPrivateName>> {
  const names = new Map<string, CoMemberPrivateName>();
  const workspaceId = wsId?.trim();
  const viewer = viewerUserId?.trim();
  const targets = uniqueIds(userIds);
  if (!workspaceId || !viewer || targets.length === 0) return names;

  try {
    const [secretResult, memberResult] = await Promise.all([
      admin
        .from('workspace_secrets')
        .select('name, value')
        .eq('ws_id', workspaceId)
        .in('name', [HIDE_MEMBER_EMAIL_SECRET, HIDE_MEMBER_NAME_SECRET]),
      admin
        .from('workspace_members')
        .select('user_id, type')
        .eq('ws_id', workspaceId)
        .in('user_id', uniqueIds([viewer, ...targets])),
    ]);

    if (secretResult.error || memberResult.error) return names;

    const hidden = new Set(
      (secretResult.data ?? [])
        .filter((row) => row.value?.trim().toLowerCase() === 'true')
        .map((row) => row.name)
    );
    const showEmail = !hidden.has(HIDE_MEMBER_EMAIL_SECRET);
    const showFullName = !hidden.has(HIDE_MEMBER_NAME_SECRET);
    if (!showEmail && !showFullName) return names;

    const members = new Set(
      (memberResult.data ?? [])
        .filter((row) => row.type === 'MEMBER')
        .map((row) => row.user_id)
    );
    if (!members.has(viewer)) return names;

    const eligible = targets.filter((id) => members.has(id));
    if (eligible.length === 0) return names;

    const { data, error } = await admin
      .from('user_private_details')
      .select('user_id, full_name, email')
      .in('user_id', eligible);
    if (error) return names;

    for (const row of data ?? []) {
      if (!row.user_id) continue;
      const fullName = showFullName ? row.full_name?.trim() : undefined;
      const email = showEmail ? row.email?.trim() : undefined;
      if (fullName || email) {
        names.set(row.user_id, {
          ...(fullName ? { fullName } : {}),
          ...(email ? { email } : {}),
        });
      }
    }
  } catch {
    // Fail closed: an unexpected error must never leak or break the page.
    return new Map();
  }

  return names;
}

/** Back-compat view of {@link getCoMemberPrivateNames}: emails only. */
export async function getCoMemberEmailFallbacks(
  input: Parameters<typeof getCoMemberPrivateNames>[0]
): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  for (const [id, value] of await getCoMemberPrivateNames(input)) {
    if (value.email) emails.set(id, value.email);
  }
  return emails;
}

/**
 * Resolves the visible name of each user for this viewer. Returns a map keyed
 * by user id; users without an id are skipped (resolve them locally with
 * `resolveUserDisplayName`).
 */
export async function resolveCoMemberNames({
  admin,
  wsId,
  viewerUserId,
  users,
  slot = 'display',
  options,
}: ResolveCoMemberNamesInput): Promise<Map<string, string>> {
  const needsFallback = users.filter((user) => user.id && !hasName(user));
  const privateNames = await getCoMemberPrivateNames({
    admin,
    wsId,
    viewerUserId,
    userIds: needsFallback.map((user) => user.id),
  });

  const resolve =
    slot === 'full' ? resolveUserFullName : resolveUserDisplayName;
  const names = new Map<string, string>();
  for (const user of users) {
    if (!user.id) continue;
    const privateName = privateNames.get(user.id);
    names.set(
      user.id,
      resolve(
        {
          display_name: user.display_name ?? user.displayName,
          full_name: (user.full_name ?? user.fullName) || privateName?.fullName,
          handle: user.handle ?? user.username,
          email: privateName?.email ?? null,
        },
        options
      )
    );
  }
  return names;
}
