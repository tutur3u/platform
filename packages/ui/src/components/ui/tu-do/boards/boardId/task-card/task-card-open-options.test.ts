import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { describe, expect, it } from 'vitest';
import {
  getTaskCardHydratingOpenOptions,
  isExternalTaskSnapshot,
} from './task-card-open-options';

const task = {
  id: 'task-1',
  name: 'Visible task',
  description: '',
  list_id: 'list-1',
  display_number: 7,
  created_at: '2026-06-12T00:00:00.000Z',
  end_date: null,
  priority: 'normal',
} satisfies Task;

const list = {
  id: 'list-1',
  name: 'To Do',
  board_id: 'board-1',
  position: 0,
  status: 'not_started',
  color: 'BLUE',
  created_at: '2026-06-12T00:00:00.000Z',
  creator_id: 'user-1',
  archived: false,
  deleted: false,
} satisfies TaskList;

describe('getTaskCardHydratingOpenOptions', () => {
  it('opens external task cards from the visible snapshot while hydrating source details', () => {
    const externalTask = {
      ...task,
      list_id: 'personal-list',
      source_workspace_id: 'source-workspace',
      source_workspace_name: 'Source workspace',
      source_board_id: 'source-board',
      source_board_name: 'Source board',
      source_list_id: 'source-list',
      source_list_name: 'Doing',
      source_list_status: 'active',
      ticket_prefix: 'SRC',
    } satisfies Task & { ticket_prefix: string };

    expect(
      getTaskCardHydratingOpenOptions({
        task: externalTask,
        boardId: 'personal-board',
        availableLists: [list],
        effectiveWorkspaceId: 'personal-workspace',
        isPersonalWorkspace: true,
      })
    ).toEqual({
      initialTask: {
        ...externalTask,
        list_id: 'source-list',
      },
      boardId: 'source-board',
      availableLists: [
        {
          id: 'source-list',
          name: 'Doing',
          board_id: 'source-board',
          position: 0,
          status: 'active',
          color: 'GRAY',
          created_at: '2026-06-12T00:00:00.000Z',
          creator_id: '',
          archived: false,
          deleted: false,
        },
      ],
      taskWsId: 'source-workspace',
      taskWorkspacePersonal: false,
      canUseBoardAssignees: true,
      assigneeMemberSource: 'board',
      initialSharedContext: {
        boardConfig: {
          id: 'source-board',
          name: 'Source board',
          ws_id: 'source-workspace',
          ticket_prefix: 'SRC',
        },
        availableLists: [
          {
            id: 'source-list',
            name: 'Doing',
            board_id: 'source-board',
            position: 0,
            status: 'active',
            color: 'GRAY',
            created_at: '2026-06-12T00:00:00.000Z',
            creator_id: '',
            archived: false,
            deleted: false,
          },
        ],
        workspaceLabels: [],
        workspaceMembers: [],
        workspaceProjects: [],
      },
    });
  });

  it('keeps local board metadata for non-source personal tasks', () => {
    expect(
      getTaskCardHydratingOpenOptions({
        task,
        boardId: 'board-1',
        availableLists: [list],
        effectiveWorkspaceId: 'workspace-1',
        isPersonalWorkspace: true,
      })
    ).toEqual({
      initialTask: task,
      boardId: 'board-1',
      availableLists: [list],
      taskWsId: 'workspace-1',
      taskWorkspacePersonal: true,
      canUseBoardAssignees: false,
      assigneeMemberSource: undefined,
      initialSharedContext: undefined,
    });
  });

  it('can keep assignees enabled for shared personal board tasks', () => {
    expect(
      getTaskCardHydratingOpenOptions({
        task,
        boardId: 'board-1',
        availableLists: [list],
        canUseBoardAssignees: true,
        effectiveWorkspaceId: 'workspace-1',
        isPersonalWorkspace: true,
      })
    ).toMatchObject({
      canUseBoardAssignees: true,
      taskWorkspacePersonal: true,
    });
  });

  it('treats source metadata as an external task snapshot', () => {
    expect(
      isExternalTaskSnapshot({
        ...task,
        source_workspace_id: 'source-workspace',
      })
    ).toBe(true);
    expect(isExternalTaskSnapshot(task)).toBe(false);
  });

  it('does not treat personal placement metadata alone as an external snapshot', () => {
    expect(
      isExternalTaskSnapshot({
        ...task,
        personal_board_id: 'board-1',
        personal_list_id: 'list-1',
      })
    ).toBe(false);
  });
});
