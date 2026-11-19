import type { Task } from '@tuturuuu/types/primitives/Task';
import { useCallback, useMemo } from 'react';
import { useCachedBoardTasks } from '../../../shared/use-cached-board-tasks';

/**
 * The labels, projects, assignees and estimation a card shows. A card in
 * multi-select bulk mode shows what every selected task has in common; every
 * other card selects a stable null from the board cache, so unrelated cache
 * writes do not re-render it.
 */
export function useTaskCardBulkDisplay({
  boardId,
  task,
  isMultiSelectMode,
  selectedTasks,
}: {
  boardId: string;
  task: Task;
  isMultiSelectMode?: boolean;
  selectedTasks?: Set<string>;
}) {
  const isBulkSelectionCard =
    !!isMultiSelectMode &&
    !!selectedTasks &&
    selectedTasks.size > 1 &&
    selectedTasks.has(task.id);
  const selectBulkTasks = useCallback(
    (tasks: Task[]) =>
      isBulkSelectionCard
        ? tasks.filter((candidate) => selectedTasks?.has(candidate.id))
        : null,
    [isBulkSelectionCard, selectedTasks]
  );
  const { data: selectedTasksFromQuery } = useCachedBoardTasks(
    boardId,
    selectBulkTasks
  );

  return useMemo(() => {
    if (!isBulkSelectionCard) {
      return {
        displayLabels: task.labels || [],
        displayProjects: task.projects || [],
        displayAssignees: task.assignees || [],
        displayEstimation: task.estimation_points,
      };
    }

    // Get all selected tasks data from query cache
    const selectedTasksData = selectedTasksFromQuery ?? [];

    if (selectedTasksData.length === 0) {
      return {
        displayLabels: task.labels || [],
        displayProjects: task.projects || [],
        displayAssignees: task.assignees || [],
        displayEstimation: task.estimation_points,
      };
    }

    // Find attributes that ALL selected tasks have in common
    // Start with all unique attributes from all selected tasks
    const allLabels = new Map<string, any>();
    const allProjects = new Map<string, any>();
    const allAssignees = new Map<string, any>();

    selectedTasksData.forEach((t) => {
      t.labels?.forEach((label) => {
        allLabels.set(label.id, label);
      });
      t.projects?.forEach((project) => {
        allProjects.set(project.id, project);
      });
      t.assignees?.forEach((assignee) => {
        allAssignees.set(assignee.id, assignee);
      });
    });

    // Filter to only those present in ALL selected tasks
    const commonLabels = Array.from(allLabels.values()).filter((label) =>
      selectedTasksData.every((t) => t.labels?.some((l) => l.id === label.id))
    );

    const commonProjects = Array.from(allProjects.values()).filter((project) =>
      selectedTasksData.every((t) =>
        t.projects?.some((p) => p.id === project.id)
      )
    );

    const commonAssignees = Array.from(allAssignees.values()).filter(
      (assignee) =>
        selectedTasksData.every((t) =>
          t.assignees?.some((a) => a.id === assignee.id)
        )
    );

    // Check if ALL selected tasks have the same estimation
    const firstEstimation = selectedTasksData[0]?.estimation_points;
    const allSameEstimation = selectedTasksData.every(
      (t) => t.estimation_points === firstEstimation
    );
    const commonEstimation = allSameEstimation ? firstEstimation : undefined;

    return {
      displayLabels: commonLabels,
      displayProjects: commonProjects,
      displayAssignees: commonAssignees,
      displayEstimation: commonEstimation,
    };
  }, [
    task.labels,
    task.projects,
    task.assignees,
    task.estimation_points,
    isBulkSelectionCard,
    selectedTasksFromQuery,
  ]);
}
