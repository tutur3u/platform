import type { RelatedTaskInfo } from '@tuturuuu/types/primitives/TaskRelationship';

export function getTaskCardParentBadgeState({
  summaryParentTaskId,
  summaryParentTask,
  parentTask,
  resolvedParentTask,
  hasLoadedRelationships,
}: {
  summaryParentTaskId: string | null;
  summaryParentTask?: RelatedTaskInfo | null;
  parentTask: RelatedTaskInfo | null;
  resolvedParentTask: RelatedTaskInfo | null;
  hasLoadedRelationships: boolean;
}) {
  const parentBadgeTask = summaryParentTaskId
    ? resolvedParentTask && resolvedParentTask.id === summaryParentTaskId
      ? resolvedParentTask
      : summaryParentTask?.id === summaryParentTaskId
        ? summaryParentTask
        : parentTask?.id === summaryParentTaskId
          ? parentTask
          : null
    : (parentTask ?? resolvedParentTask);

  return {
    hasParentRelationship:
      !!summaryParentTaskId || (hasLoadedRelationships && !!parentTask),
    parentBadgeTask,
  };
}
