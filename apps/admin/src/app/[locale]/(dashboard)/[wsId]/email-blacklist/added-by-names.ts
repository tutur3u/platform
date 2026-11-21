import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { resolveCoMemberNames } from '@tuturuuu/utils/co-member-names';

interface AddedByUser {
  id: string;
  display_name: string | null;
  handle?: string | null;
}

/**
 * Fills the "added by" `users.display_name` with the co-member name
 * (display name -> email -> handle, D246). The email only ever lands in the
 * name field, and only when the viewer and the author are MEMBERs of `wsId`
 * and the workspace does not hide member emails.
 */
export async function withAddedByNames<
  T extends { users?: AddedByUser | null },
>({
  rows,
  viewerUserId,
  wsId,
}: {
  rows: T[];
  viewerUserId: string | null | undefined;
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
    const name = row.users ? names.get(row.users.id) : undefined;
    if (!row.users || !name) return row;
    return { ...row, users: { ...row.users, display_name: name } };
  });
}
