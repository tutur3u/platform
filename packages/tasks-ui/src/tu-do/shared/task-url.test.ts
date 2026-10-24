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

  it('normalizes route prefix slashes in linear time', () => {
    expect(buildWorkspaceTaskUrl({ ...task, routePrefix: '//tasks//' })).toBe(
      '/en/workspace-1/tasks/boards/board-1?task=task-1'
    );

    const routePrefix = `${'/'.repeat(100_000)}x${'/'.repeat(100_000)}y`;
    const startedAt = performance.now();
    const url = buildWorkspaceTaskUrl({ ...task, routePrefix });
    expect(performance.now() - startedAt).toBeLessThan(500);
    expect(url).toContain(`/workspace-1/x${'/'.repeat(100_000)}y/boards/`);
  });
});
