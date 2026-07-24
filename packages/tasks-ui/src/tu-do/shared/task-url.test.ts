import { describe, expect, it } from 'vitest';
import { buildWorkspaceTaskUrl } from './task-url';

describe('buildWorkspaceTaskUrl', () => {
  const task = {
    boardId: 'board-1',
    currentPathname: '/en/workspace-1/tasks/boards/board-1',
    taskId: 'task-1',
    workspaceId: 'workspace-1',
  };

  it('keeps the platform task prefix by default', () => {
    expect(buildWorkspaceTaskUrl(task)).toBe(
      '/en/workspace-1/tasks/boards/board-1?task=task-1'
    );
  });

  it('builds satellite-native task URLs without string replacement', () => {
    expect(
      buildWorkspaceTaskUrl({
        ...task,
        currentPathname: '/en/workspace-1/boards/board-1',
        routePrefix: '',
      })
    ).toBe('/en/workspace-1/boards/board-1?task=task-1');
  });

  it('infers the satellite-native route from the current board pathname', () => {
    expect(
      buildWorkspaceTaskUrl({
        ...task,
        currentPathname: '/en/workspace-1/boards/board-1',
      })
    ).toBe('/en/workspace-1/boards/board-1?task=task-1');
  });
});
