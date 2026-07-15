'use client';

import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useEffect } from 'react';
import type { TaskFilters } from '../../task-filter';

interface UseKeyboardShortcutsProps {
  columns: TaskList[];
  boardId: string | null;
  filters?: TaskFilters;
  selectedTasks: Set<string>;
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: (enabled: boolean) => void;
  createTask: (
    boardId: string,
    listId: string,
    columns: TaskList[],
    filters?: TaskFilters
  ) => void;
  clearSelection: () => void;
  handleCrossBoardMove: () => void;
}

export function useKeyboardShortcuts({
  columns,
  boardId,
  filters,
  selectedTasks,
  isMultiSelectMode,
  setIsMultiSelectMode,
  createTask,
  clearSelection,
  handleCrossBoardMove,
}: UseKeyboardShortcutsProps) {
  // General keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (event.key === 'Escape') {
        clearSelection();
      }

      // C to create a new task (in the first list)
      if (
        event.key.toLowerCase() === 'c' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.altKey &&
        !isInputField
      ) {
        event.preventDefault();
        event.stopPropagation();
        // Open create dialog with the first list
        const firstList = columns[0];
        if (firstList && boardId) {
          createTask(boardId, firstList.id, columns, filters);
        }
      }

      // Ctrl/Cmd + M to move selected tasks to another board
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'm' &&
        selectedTasks.size > 0
      ) {
        event.preventDefault();
        event.stopPropagation();
        handleCrossBoardMove();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    clearSelection,
    handleCrossBoardMove,
    selectedTasks,
    columns,
    boardId,
    createTask,
    filters,
  ]);

  // Multi-select specific shortcuts (Shift key handling)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Only Shift key (without other modifiers) enables multiselect mode
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (!isMultiSelectMode) {
          setIsMultiSelectMode(true);
        }
      }

      // Turn OFF if any forbidden modifier is pressed
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if (isMultiSelectMode) {
          setIsMultiSelectMode(false);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Exit multiselect mode when all modifier keys are released
      if (!e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Only exit if we have no selected tasks
        if (isMultiSelectMode && selectedTasks.size === 0) {
          setIsMultiSelectMode(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isMultiSelectMode, selectedTasks.size, setIsMultiSelectMode]);
}
