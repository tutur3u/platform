'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import { useMemo } from 'react';

export function useAppliedSets(tasks: Task[], selectedTasks: Set<string>) {
  // Calculate which labels/projects/assignees are applied to ALL selected tasks
  // Compute directly from tasks cache to sync with optimistic updates and realtime
  const appliedLabels = useMemo(() => {
    if (selectedTasks.size === 0) return new Set<string>();
    const labelCounts = new Map<string, number>();

    // Get labels from selected tasks
    tasks.forEach((task) => {
      if (selectedTasks.has(task.id)) {
        task.labels?.forEach((label) => {
          labelCounts.set(label.id, (labelCounts.get(label.id) || 0) + 1);
        });
      }
    });

    // Return labels that appear on ALL selected tasks
    return new Set(
      Array.from(labelCounts.entries())
        .filter(([_, count]) => count === selectedTasks.size)
        .map(([labelId]) => labelId)
    );
  }, [tasks, selectedTasks]);

  const appliedProjects = useMemo(() => {
    if (selectedTasks.size === 0) return new Set<string>();
    const projectCounts = new Map<string, number>();

    // Get projects from selected tasks
    tasks.forEach((task) => {
      if (selectedTasks.has(task.id)) {
        task.projects?.forEach((project) => {
          projectCounts.set(
            project.id,
            (projectCounts.get(project.id) || 0) + 1
          );
        });
      }
    });

    // Return projects that appear on ALL selected tasks
    return new Set(
      Array.from(projectCounts.entries())
        .filter(([_, count]) => count === selectedTasks.size)
        .map(([projectId]) => projectId)
    );
  }, [tasks, selectedTasks]);

  const appliedAssignees = useMemo(() => {
    if (selectedTasks.size === 0) return new Set<string>();
    const assigneeCounts = new Map<string, number>();

    // Get assignees from selected tasks
    tasks.forEach((task) => {
      if (selectedTasks.has(task.id)) {
        task.assignees?.forEach((assignee) => {
          assigneeCounts.set(
            assignee.id,
            (assigneeCounts.get(assignee.id) || 0) + 1
          );
        });
      }
    });

    // Return assignees that appear on ALL selected tasks
    return new Set(
      Array.from(assigneeCounts.entries())
        .filter(([_, count]) => count === selectedTasks.size)
        .map(([userId]) => userId)
    );
  }, [tasks, selectedTasks]);

  return { appliedLabels, appliedProjects, appliedAssignees };
}
