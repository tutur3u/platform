import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createWorkspaceTaskBoardMock, getWorkspaceTaskBoardMock } = vi.hoisted(
  () => ({
    createWorkspaceTaskBoardMock: vi.fn(),
    getWorkspaceTaskBoardMock: vi.fn(),
  })
);

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  createWorkspaceTaskBoard: createWorkspaceTaskBoardMock,
  getWorkspaceTaskBoard: getWorkspaceTaskBoardMock,
  listWorkspaceTasks: vi.fn(),
  listWorkspaceTaskLists: vi.fn(),
  listTaskBoardStatusTemplates: vi.fn(),
  updateWorkspaceTask: vi.fn(),
  createWorkspaceTaskRelationship: vi.fn(),
  createWorkspaceTaskWithRelationship: vi.fn(),
  deleteWorkspaceTaskRelationship: vi.fn(),
  deleteWorkspaceTask: vi.fn(),
  moveWorkspaceTask: vi.fn(),
  createWorkspaceTask: vi.fn(),
  createWorkspaceTaskList: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: vi.fn(() => ({})),
}));

import { createBoardWithTemplate, getTaskBoard } from '../task-helper';

describe('task-helper workspace board API routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getTaskBoard uses explicit workspace id', async () => {
    getWorkspaceTaskBoardMock.mockResolvedValue({
      board: { id: 'board-1', ws_id: 'ws-1', name: 'Board 1' },
    });

    const result = await getTaskBoard(
      {} as TypedSupabaseClient,
      'board-1',
      'ws-1',
      { baseUrl: 'https://internal.example.com' }
    );

    expect(getWorkspaceTaskBoardMock).toHaveBeenCalledWith('ws-1', 'board-1', {
      baseUrl: 'https://internal.example.com',
    });
    expect(result).toEqual({ id: 'board-1', ws_id: 'ws-1', name: 'Board 1' });
  });

  it('getTaskBoard skips internal API call when workspace id is omitted', async () => {
    const result = await getTaskBoard(
      {} as TypedSupabaseClient,
      'board-1',
      undefined,
      { baseUrl: 'https://internal.example.com' }
    );

    expect(getWorkspaceTaskBoardMock).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('createBoardWithTemplate creates board through internal API helper', async () => {
    createWorkspaceTaskBoardMock.mockResolvedValue({
      board: {
        id: 'board-1',
        ws_id: 'ws-1',
        name: 'Board 1',
        template_id: 'template-1',
      },
    });

    const result = await createBoardWithTemplate(
      'ws-1',
      'Board 1',
      'template-1'
    );

    expect(createWorkspaceTaskBoardMock).toHaveBeenCalledWith(
      'ws-1',
      {
        name: 'Board 1',
        template_id: 'template-1',
        icon: null,
      },
      undefined
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'board-1',
        ws_id: 'ws-1',
        name: 'Board 1',
      })
    );
  });
});
