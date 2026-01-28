'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import { useCallback, useRef, useState } from 'react';

export function useMultiSelect(
  tasks: Task[],
  _isMultiSelectMode: boolean,
  setIsMultiSelectMode: (enabled: boolean) => void
) {
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const anchoredColumn = useRef<string | null>(null);
  const anchoredTask = useRef<string | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedTasks(new Set());
    setIsMultiSelectMode(false);
    anchoredTask.current = null;
    anchoredColumn.current = null;
  }, [setIsMultiSelectMode]);

  const handleTaskSelect = useCallback(
    (taskId: string, event: React.MouseEvent) => {
      const isShiftPressed = event.shiftKey;

      if (isShiftPressed) {
        // Range toggle - toggle all tasks between anchor and current task
        if (anchoredTask.current) {
          const clickedTask = tasks.find((t) => t.id === taskId);
          if (clickedTask && clickedTask.list_id === anchoredColumn.current) {
            const columnTasks = tasks.filter(
              (t) => t.list_id === anchoredColumn.current
            );
            const anchorIndex = columnTasks.findIndex(
              (t) => t.id === anchoredTask.current
            );
            const clickedIndex = columnTasks.findIndex((t) => t.id === taskId);

            const minTaskIndex = Math.min(anchorIndex, clickedIndex);
            const maxTaskIndex = Math.max(anchorIndex, clickedIndex);
            const rangeTaskIds = columnTasks
              .slice(minTaskIndex, maxTaskIndex + 1)
              .map((t) => t.id);

            // Check if clicked task is already selected to determine action
            const isClickedSelected = selectedTasks.has(taskId);

            setSelectedTasks((prev) => {
              const newSet = new Set(prev);
              if (isClickedSelected) {
                // If clicked task is selected, deselect the entire range
                for (const id of rangeTaskIds) {
                  newSet.delete(id);
                }
              } else {
                // If clicked task is not selected, select the entire range
                for (const id of rangeTaskIds) {
                  newSet.add(id);
                }
              }
              return newSet;
            });
          } else {
            // Different column or task not found - start new selection
            setSelectedTasks(new Set([taskId]));

            const newTask = tasks.find((t) => t.id === taskId);
            if (newTask) {
              anchoredColumn.current = newTask.list_id;
            } else {
              anchoredColumn.current = null;
            }
          }
        } else {
          // No anchor - start new selection
          setSelectedTasks(new Set([taskId]));

          const newTask = tasks.find((t) => t.id === taskId);
          if (newTask) {
            anchoredColumn.current = newTask.list_id;
          } else {
            anchoredColumn.current = null;
          }
        }
      } else {
        // Toggle selection in multi-select mode
        setSelectedTasks((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(taskId)) {
            newSet.delete(taskId);
          } else {
            newSet.add(taskId);
          }
          return newSet;
        });

        const clickedTask = tasks.find((t) => t.id === taskId);
        if (clickedTask) {
          anchoredColumn.current = clickedTask.list_id;
        } else {
          anchoredColumn.current = null;
        }
      }

      // Update anchored taskId
      anchoredTask.current = taskId;
    },
    [tasks, selectedTasks]
  );

  return {
    selectedTasks,
    setSelectedTasks,
    handleTaskSelect,
    clearSelection,
    anchoredColumn,
    anchoredTask,
  };
}
