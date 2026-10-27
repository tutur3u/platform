import { listWorkspaceTaskBoardViewableMembers } from '@tuturuuu/internal-api/tasks';

export interface BoardMember {
  id: string;
  user_id?: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
}

/** Shared by the assignee picker and the sprint plan, so both read one cache entry. */
export function getBoardMembersQueryKey(wsId: string, boardId: string) {
  return ['task-board-viewable-members', wsId, boardId] as const;
}

export async function fetchBoardMembers(
  wsId: string,
  boardId: string
): Promise<BoardMember[]> {
  const payload = await listWorkspaceTaskBoardViewableMembers(wsId, boardId);
  const members = Array.isArray(payload?.members) ? payload.members : [];

  return members.map((member) => ({
    id: member.user_id,
    user_id: member.user_id,
    display_name: member.display_name || member.email || member.user_id,
    email: member.email ?? undefined,
    avatar_url: member.avatar_url ?? undefined,
  }));
}
