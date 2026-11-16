import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { resolveCoMemberNames } from '@tuturuuu/utils/co-member-names';

/** A related user as the task payloads carry it (`id` + `display_name`). */
export interface DisplayNameUser {
  id: string | null | undefined;
  display_name?: string | null;
  /** Pass the selected handle; `undefined` means it was not selected. */
  handle?: string | null;
}

function hasDisplayName(user: DisplayNameUser) {
  return Boolean(user.display_name?.trim());
}

/**
 * Co-member names (USER decision D246) for payloads whose users only carry a
 * `display_name`, such as RPC rows and leaderboard members. Loads the public
 * handle of nameless users when the caller did not select it, then defers
 * every email decision to `resolveCoMemberNames`. Fails closed: a handle
 * lookup error only drops the handle fallback.
 */
export async function resolveCoMemberDisplayNames({
  admin,
  wsId,
  viewerUserId,
  users,
}: {
  admin: TypedSupabaseClient;
  wsId: string | null | undefined;
  viewerUserId: string | null | undefined;
  users: readonly DisplayNameUser[];
}): Promise<Map<string, string>> {
  const nameless = [
    ...new Set(
      users
        .filter((user) => !hasDisplayName(user) && user.handle === undefined)
        .map((user) => user.id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const handles = new Map<string, string | null>();
  if (nameless.length > 0) {
    try {
      const { data } = await admin
        .from('users')
        .select('id, handle')
        .in('id', nameless);
      for (const row of data ?? []) handles.set(row.id, row.handle ?? null);
    } catch {
      // The handle is only the last fallback; keep going without it.
    }
  }

  return resolveCoMemberNames({
    admin,
    wsId,
    viewerUserId,
    users: users.map((user) => ({
      id: user.id,
      display_name: user.display_name ?? null,
      handle:
        user.handle === undefined
          ? (handles.get(user.id ?? '') ?? null)
          : user.handle,
    })),
  });
}

/** Writes the resolved name into the user's existing `display_name` field. */
export function withCoMemberDisplayName<
  T extends { id?: string | null; display_name?: string | null },
>(user: T, names: ReadonlyMap<string, string>): T {
  const name = user.id ? names.get(user.id) : undefined;
  return name ? { ...user, display_name: name } : user;
}
