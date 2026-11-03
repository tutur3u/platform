import { useQuery } from '@tanstack/react-query';
import { listWorkspaceTaskBoardViewableMembers } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useMemo } from 'react';
import { useProgressiveLoader } from '../progressive-loader-context';
import { collectBoardPeople, countUnassignedTasks } from './board-filter-state';

/**
 * Options come from the same complete member cache as the assignee picker.
 * Counts use unfiltered loaded tasks and are hidden until all lists are loaded.
 */
export function useBoardHeaderData({
  tasks,
  lists,
  currentUserId,
  workspaceId,
  boardId,
  enabled,
}: {
  tasks: Task[];
  lists: TaskList[];
  currentUserId?: string;
  workspaceId: string;
  boardId: string;
  enabled: boolean;
}) {
  const { pagination } = useProgressiveLoader();
  const { data: members } = useQuery({
    queryKey: ['task-board-viewable-members', workspaceId, boardId],
    queryFn: async () => {
      const payload = await listWorkspaceTaskBoardViewableMembers(
        workspaceId,
        boardId
      );
      // Preserve the normalized cache shape used by AssigneeSelect.
      return (payload.members ?? []).map((member) => ({
        id: member.user_id,
        user_id: member.user_id,
        display_name: member.display_name || member.email || member.user_id,
        email: member.email ?? undefined,
        avatar_url: member.avatar_url ?? undefined,
      }));
    },
    enabled: enabled && Boolean(workspaceId && boardId),
    staleTime: 5 * 60 * 1000,
  });
  // Deleted lists still arrive with the board but are never loaded.
  const countsComplete = lists.every((list) => {
    if (list.deleted) return true;
    const state = pagination[list.id];
    return state && !state.hasMore && !state.isInitialLoad && !state.isLoading;
  });
  const visibleTasks = useMemo(
    () => tasks.filter((task) => !task.deleted_at),
    [tasks]
  );
  const people = useMemo(
    () =>
      collectBoardPeople(
        visibleTasks,
        currentUserId,
        enabled ? members : undefined
      ),
    [currentUserId, enabled, members, visibleTasks]
  );
  const unassignedCount = useMemo(
    () => countUnassignedTasks(visibleTasks),
    [visibleTasks]
  );
  const projectTaskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of visibleTasks) {
      for (const project of task.projects ?? []) {
        counts.set(project.id, (counts.get(project.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [visibleTasks]);

  return { people, projectTaskCounts, unassignedCount, countsComplete };
}
