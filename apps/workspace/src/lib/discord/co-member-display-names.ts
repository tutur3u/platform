import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { resolveCoMemberNames } from '@tuturuuu/utils/co-member-names';

interface DiscordLinkedUser {
  id: string;
  display_name: string | null;
  handle?: string | null;
}

/**
 * Fills `users.display_name` of Discord member rows with the co-member name
 * (display name -> email -> handle, D246). The email only ever lands in the
 * name field, and only when the viewer and the user are MEMBERs of `wsId` and
 * the workspace does not hide member emails. A bare handle fallback is left
 * out of `display_name` because the dashboard already shows `@handle`.
 */
export async function withCoMemberDisplayNames<
  T extends { users: DiscordLinkedUser | null },
>({
  rows,
  viewerUserId,
  wsId,
}: {
  rows: T[];
  viewerUserId: string;
  wsId: string;
}): Promise<T[]> {
  const users = rows.flatMap((row) => (row.users ? [row.users] : []));
  if (!users.some((user) => !user.display_name?.trim())) return rows;

  const admin = await createAdminClient();
  const names = await resolveCoMemberNames({
    admin,
    users,
    viewerUserId,
    wsId,
  });

  return rows.map((row) => {
    if (!row.users) return row;
    const name = names.get(row.users.id);
    if (!name || name === row.users.handle) return row;
    return { ...row, users: { ...row.users, display_name: name } };
  });
}
