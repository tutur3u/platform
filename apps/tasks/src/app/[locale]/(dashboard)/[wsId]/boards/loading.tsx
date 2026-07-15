import { TaskBoardLoadingState } from '@tuturuuu/tasks-ui/tu-do/shared/task-board-loading-state';
import { createElement } from 'react';

export default function Loading() {
  return createElement(TaskBoardLoadingState, {
    root: true,
    showHeader: true,
  });
}
