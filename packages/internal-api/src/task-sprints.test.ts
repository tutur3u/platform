import { describe, expect, it, vi } from 'vitest';
import {
  endWorkspaceTaskBoardSprint,
  listWorkspaceTaskBoardSprints,
  moveTasksToWorkspaceTaskBoardSprint,
  startWorkspaceTaskBoardSprint,
  updateWorkspaceTaskBoardSprint,
  updateWorkspaceTaskBoardSprintLength,
} from './task-sprints';

describe('board sprint internal API helpers', () => {
  it('calls the board sprint routes with stable paths and payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        schemaAvailable: true,
        sprintLengthWeeks: 2,
        sprints: [],
      }),
    });
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as typeof fetch,
    };

    await listWorkspaceTaskBoardSprints('ws 1', 'board-1', options);
    await updateWorkspaceTaskBoardSprintLength('ws-1', 'board-1', 1, options);
    await updateWorkspaceTaskBoardSprint(
      'ws-1',
      'board-1',
      'sprint-1',
      { goal: 'Ship sprints' },
      options
    );
    await startWorkspaceTaskBoardSprint('ws-1', 'board-1', 'sprint-1', options);
    await endWorkspaceTaskBoardSprint(
      'ws-1',
      'board-1',
      'sprint-1',
      { decisions: { 'task-1': 'backlog' }, goal_result: 'met' },
      options
    );
    await moveTasksToWorkspaceTaskBoardSprint(
      'ws-1',
      'board-1',
      'sprint-2',
      ['task-1', 'task-2'],
      options
    );

    const base =
      'https://internal.example.com/api/v1/workspaces/ws-1/task-boards/board-1/sprints';
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://internal.example.com/api/v1/workspaces/ws%201/task-boards/board-1/sprints',
      base,
      `${base}/sprint-1`,
      `${base}/sprint-1/start`,
      `${base}/sprint-1/end`,
      `${base}/sprint-2/tasks`,
    ]);
    expect(fetchMock.mock.calls.map(([, init]) => init.method)).toEqual([
      undefined,
      'PUT',
      'PATCH',
      'POST',
      'POST',
      'POST',
    ]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      sprint_length_weeks: 1,
    });
    expect(JSON.parse(fetchMock.mock.calls[4][1].body as string)).toEqual({
      decisions: { 'task-1': 'backlog' },
      goal_result: 'met',
    });
    expect(JSON.parse(fetchMock.mock.calls[5][1].body as string)).toEqual({
      task_ids: ['task-1', 'task-2'],
    });
  });
});
