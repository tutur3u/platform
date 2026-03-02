import { useQuery } from '@tanstack/react-query';
import type { NodeViewProps } from '@tiptap/react';
import { createClient } from '@tuturuuu/supabase/next/client';

export type TriStateChecked = boolean | 'indeterminate';

export interface MentionedTaskRow {
  id: string;
  closed_at: string | null;
  list_id: string;
  task_lists: { status: string | null; color: string | null };
}

export function extractTaskMentionIds(node: NodeViewProps['node']): string[] {
  const taskIds: string[] = [];

  node.descendants((childNode) => {
    if (
      childNode.type.name === 'mention' &&
      childNode.attrs.entityType === 'task' &&
      childNode.attrs.entityId
    ) {
      taskIds.push(childNode.attrs.entityId);
    }
    return true;
  });

  return taskIds;
}

export function areAllMentionedTasksCompleted(
  mentionedTasks: MentionedTaskRow[] | undefined
): boolean {
  if (!mentionedTasks || mentionedTasks.length === 0) return false;

  return mentionedTasks.every((task) => {
    const listStatus = task.task_lists?.status;
    return (
      task.closed_at !== null ||
      listStatus === 'done' ||
      listStatus === 'closed'
    );
  });
}

export function getCompletedTaskColor(
  mentionedTasks: MentionedTaskRow[] | undefined
): string | null {
  if (!mentionedTasks || mentionedTasks.length === 0) return null;

  const taskWithColor = mentionedTasks.find((task) => task.task_lists?.color);
  return taskWithColor?.task_lists?.color?.toLowerCase() || null;
}

export function resolveCheckboxState({
  manualOverride,
  nodeChecked,
  allMentionedTasksCompleted,
}: {
  manualOverride: TriStateChecked | null;
  nodeChecked: unknown;
  allMentionedTasksCompleted: boolean;
}): TriStateChecked {
  if (manualOverride !== null) return manualOverride;

  if (nodeChecked === 'indeterminate') return 'indeterminate';
  if (nodeChecked !== undefined) return !!nodeChecked;

  return allMentionedTasksCompleted;
}

export function getNextTriState(
  checkboxState: TriStateChecked
): TriStateChecked {
  if (checkboxState === false) return 'indeterminate';
  if (checkboxState === 'indeterminate') return true;
  return false;
}

export function useMentionedTaskStatuses(taskMentionIds: string[]) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['task-list-item-mentions', ...taskMentionIds.sort()],
    queryFn: async () => {
      if (taskMentionIds.length === 0) return [] as MentionedTaskRow[];

      const { data, error } = await supabase
        .from('tasks')
        .select('id, closed_at, list_id, task_lists!inner(status, color)')
        .in('id', taskMentionIds);

      if (error) throw error;
      return (data || []) as MentionedTaskRow[];
    },
    enabled: taskMentionIds.length > 0,
    staleTime: 10000,
    refetchOnWindowFocus: false,
  });
}
