import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { describe, expect, it } from 'vitest';
import { getTaskCardResourceContext } from './task-card-resource-context';

const pageList = {
  id: 'page-list',
  name: 'Page list',
  board_id: 'page-board',
  position: 0,
  status: 'not_started',
  color: 'BLUE',
  created_at: '2026-07-04T00:00:00.000Z',
  creator_id: 'user-1',
  archived: false,
  deleted: false,
} satisfies TaskList;

const task = {
  id: 'task-1',
  name: 'Task',
  description: '',
  list_id: 'page-list',
  display_number: 1,
  created_at: '2026-07-04T00:00:00.000Z',
  end_date: null,
  priority: 'normal',
} satisfies Task;

describe('getTaskCardResourceContext', () => {
  it('keeps local task resources on the page workspace and board', () => {
    expect(
      getTaskCardResourceContext({
        boardId: 'page-board',
        pageWorkspaceId: 'page-workspace',
        propAvailableLists: [pageList],
        task,
      })
    ).toEqual({
      boardViewableMembersBoardId: 'page-board',
      boardViewableMembersWorkspaceId: 'page-workspace',
      effectiveWorkspaceId: 'page-workspace',
      initialAvailableLists: [pageList],
      isSourceWorkspaceTask: false,
      relationshipWorkspaceId: 'page-workspace',
      taskBoardId: 'page-board',
    });
  });

  it('routes source task labels, projects, lists, and members to the source workspace and board', () => {
    expect(
      getTaskCardResourceContext({
        boardId: 'personal-board',
        pageWorkspaceId: 'personal-workspace',
        propAvailableLists: [pageList],
        task: {
          ...task,
          list_id: 'personal-list',
          source_board_id: 'source-board',
          source_workspace_id: 'source-workspace',
        },
      })
    ).toEqual({
      boardViewableMembersBoardId: 'source-board',
      boardViewableMembersWorkspaceId: 'source-workspace',
      effectiveWorkspaceId: 'source-workspace',
      initialAvailableLists: undefined,
      isSourceWorkspaceTask: true,
      relationshipWorkspaceId: 'source-workspace',
      taskBoardId: 'source-board',
    });
  });

  it('uses the page workspace when a source board is present without source workspace metadata', () => {
    expect(
      getTaskCardResourceContext({
        boardId: 'page-board',
        pageWorkspaceId: 'page-workspace',
        propAvailableLists: [pageList],
        task: {
          ...task,
          source_board_id: 'source-board',
        },
      })
    ).toMatchObject({
      boardViewableMembersBoardId: 'source-board',
      boardViewableMembersWorkspaceId: 'page-workspace',
      effectiveWorkspaceId: 'page-workspace',
      initialAvailableLists: undefined,
      isSourceWorkspaceTask: true,
      relationshipWorkspaceId: 'page-workspace',
      taskBoardId: 'source-board',
    });
  });

  it('keeps page board list data when only source workspace metadata is available', () => {
    expect(
      getTaskCardResourceContext({
        boardId: 'page-board',
        pageWorkspaceId: 'page-workspace',
        propAvailableLists: [pageList],
        task: {
          ...task,
          source_workspace_id: 'source-workspace',
        },
      })
    ).toMatchObject({
      boardViewableMembersBoardId: 'page-board',
      boardViewableMembersWorkspaceId: 'source-workspace',
      effectiveWorkspaceId: 'source-workspace',
      initialAvailableLists: [pageList],
      isSourceWorkspaceTask: true,
      relationshipWorkspaceId: 'source-workspace',
      taskBoardId: 'page-board',
    });
  });

  it('routes personal external labels and projects to the personal overlay workspace', () => {
    expect(
      getTaskCardResourceContext({
        boardId: 'personal-board',
        pageWorkspaceId: 'personal-workspace',
        propAvailableLists: [pageList],
        task: {
          ...task,
          is_personal_external: true,
          personal_board_id: 'personal-board',
          personal_list_id: 'personal-list',
          source_board_id: 'source-board',
          source_workspace_id: 'source-workspace',
        },
      })
    ).toMatchObject({
      effectiveWorkspaceId: 'source-workspace',
      relationshipWorkspaceId: 'personal-workspace',
      taskBoardId: 'source-board',
    });
  });
});
