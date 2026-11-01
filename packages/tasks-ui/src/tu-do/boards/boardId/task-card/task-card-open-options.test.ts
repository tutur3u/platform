import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { getTaskTicketLabel } from '@tuturuuu/utils/task-helper';
import { describe, expect, it } from 'vitest';
import {
  getShownTaskTicketLabel,
  getShownTicketIdentifier,
  getTaskCardBadgeProjects,
  getTaskCardHydratingOpenOptions,
  getTaskCardTicketIdentifier,
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
      visibleBoardId: 'personal-board',
      visibleTaskSnapshot: externalTask,
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

describe('getTaskCardTicketIdentifier', () => {
  it('omits the identifier for project-less tasks', () => {
    expect(
      getTaskCardTicketIdentifier({
        boardConfig: undefined,
        isExternalTask: false,
        task,
      })
    ).toBeNull();
  });

  it('uses project identity for both local and external cards', () => {
    expect(
      getTaskCardTicketIdentifier({
        boardConfig: {
          id: 'board-1',
          ws_id: 'workspace-1',
          ticket_prefix: 'VHP',
          estimation_type: null,
          extended_estimation: false,
          allow_zero_estimates: false,
        },
        isExternalTask: false,
        task: {
          ...task,
          projects: [
            {
              id: 'p',
              name: 'Platform',
              status: 'active',
              ticket_key: 'PLA',
              ticket_number: 12,
            },
          ],
        },
      })
    ).toBe('PLA-12');
    expect(
      getTaskCardTicketIdentifier({
        boardConfig: undefined,
        isExternalTask: true,
        task: {
          ...task,
          projects: [
            {
              id: 'p',
              name: 'Platform',
              status: 'active',
              ticket_key: 'PLA',
              ticket_number: 12,
            },
          ],
        },
      })
    ).toBe('PLA-12');
  });
});

describe('getTaskCardBadgeProjects', () => {
  const platform = {
    id: 'p-1',
    name: 'Platform',
    ticket_key: 'PLA',
    ticket_number: 2,
  };
  const mobile = {
    id: 'p-2',
    name: 'Mobile',
    ticket_key: 'MOB',
    ticket_number: 1,
  };
  const card = (projects: object[], ticket_projects?: object[]) =>
    ({ projects, ticket_projects }) as unknown as Task;

  it('drops the badge when the ticket prefix already names the only project', () => {
    expect(getTaskCardBadgeProjects(card([platform]), 'PLA-2')).toEqual([]);
  });

  it('keeps every badge when the task has several projects', () => {
    expect(getTaskCardBadgeProjects(card([platform, mobile]), 'PLA-2')).toEqual(
      [platform, mobile]
    );
  });

  it('keeps the badge when the project has no key, so there is no prefix', () => {
    expect(getTaskCardBadgeProjects(card([platform]), null)).toEqual([
      platform,
    ]);
  });

  it('keeps a personal project badge when the ticket comes from the source project', () => {
    expect(
      getTaskCardBadgeProjects(card([mobile], [platform]), 'PLA-2')
    ).toEqual([mobile]);
  });

  it('shows nothing for a task without projects', () => {
    expect(getTaskCardBadgeProjects(card([]), null)).toEqual([]);
  });
});

describe('getShownTicketIdentifier', () => {
  it('shows no ticket ID in Documents lists, so their project badge stays', () => {
    expect(getShownTicketIdentifier('PLA-2', 'documents')).toBeNull();
    expect(getShownTicketIdentifier('PLA-2', 'active')).toBe('PLA-2');
  });

  it('reads the ticket ID off the task', () => {
    const task = {
      id: 't1',
      projects: [{ id: 'p1', name: 'Platform', ticket_key: 'PLA' }],
      ticket_projects: [
        { id: 'p1', name: 'Platform', ticket_key: 'PLA', ticket_number: 2 },
      ],
    } as unknown as Task;
    expect(getShownTaskTicketLabel(task, 'documents')).toBeNull();
    expect(getShownTaskTicketLabel(task, 'active')).toBe(
      getTaskTicketLabel(task)
    );
  });
});
