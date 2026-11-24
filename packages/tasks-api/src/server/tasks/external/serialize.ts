import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { resolveCoMemberNames } from '@tuturuuu/utils/co-member-names';

export type TaskPerson = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

export type TaskCommentRow = {
  id: string;
  task_id: string;
  author_id: string | null;
  external_author: string | null;
  external_url: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
};

export type TaskComment = {
  id: string;
  task_id: string;
  author: TaskPerson | null;
  external_author: string | null;
  external_url: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
};

export const COMMENT_COLUMNS =
  'id, task_id, author_id, external_author, external_url, body, created_at, edited_at';

/**
 * Resolves user ids to display names the same way the history route does:
 * co-member names with the email fallback decided on the server.
 */
export async function loadPeople(
  admin: TypedSupabaseClient,
  wsId: string,
  viewerUserId: string,
  ids: Iterable<string | null | undefined>
): Promise<Map<string, TaskPerson>> {
  const unique = [...new Set([...ids].filter((id): id is string => !!id))];
  const people = new Map<string, TaskPerson>();
  if (!unique.length) return people;

  const { data, error } = await admin
    .from('users')
    .select('id, display_name, handle, avatar_url')
    .in('id', unique);
  if (error) throw new Error('Failed to load people');

  const names = await resolveCoMemberNames({
    admin,
    users: data ?? [],
    viewerUserId,
    wsId,
  });
  for (const row of data ?? []) {
    people.set(row.id, {
      id: row.id,
      display_name:
        names.get(row.id) || row.display_name || row.handle || 'Unknown',
      avatar_url: row.avatar_url ?? null,
    });
  }
  return people;
}

export function serializeComment(
  row: TaskCommentRow,
  people: Map<string, TaskPerson>
): TaskComment {
  return {
    id: row.id,
    task_id: row.task_id,
    author: row.author_id ? (people.get(row.author_id) ?? null) : null,
    external_author: row.external_author,
    external_url: row.external_url,
    body: row.body,
    created_at: row.created_at,
    edited_at: row.edited_at,
  };
}
