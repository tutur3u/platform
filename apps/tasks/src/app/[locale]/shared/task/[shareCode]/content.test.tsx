import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  SharedTaskEditResponse,
  SharedTaskViewResponse,
} from '@/app/api/v1/shared/tasks/[shareCode]/response';
import {
  getSharedTaskContentModel,
  getSharedTaskDescriptionText,
  getSharedTaskEditContext,
  getSharedTaskEditLists,
} from './content-contract';

const baseResponse = {
  task: {
    id: 'task-id',
    name: 'Visible Task',
    description: JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Visible body' }],
        },
      ],
    }),
    list_id: 'list-id',
    display_number: 7,
    priority: 'normal' as const,
    created_at: '2026-08-01T00:00:00.000Z',
    labels: [
      {
        id: 'attached-label-id',
        name: 'Attached Label',
        color: '#123456',
        created_at: '2026-08-01T00:00:00.000Z',
      },
    ],
    projects: [
      {
        id: 'attached-project-id',
        name: 'Attached Project',
        status: 'active',
      },
    ],
    assignees: [
      {
        id: 'attached-user-id',
        display_name: 'Attached Person',
        avatar_url: 'https://example.com/attached.png',
      },
    ],
  },
  workspace: { id: 'workspace-id', name: 'Visible Workspace' },
  board: { id: 'board-id', name: 'Visible Board' },
  list: { id: 'list-id', name: 'Visible List' },
};

describe('SharedTaskContent permission contracts', () => {
  it('keeps edit catalogs impossible in the view response type', () => {
    type ViewCatalogKey = Extract<
      keyof SharedTaskViewResponse,
      | 'availableLists'
      | 'workspaceLabels'
      | 'workspaceProjects'
      | 'workspaceMembers'
    >;
    expectTypeOf<ViewCatalogKey>().toEqualTypeOf<never>();

    const response: SharedTaskViewResponse = {
      ...baseResponse,
      permission: 'view',
    };
    const model = getSharedTaskContentModel(response);

    expect(model).toEqual({ kind: 'view', response });
    expect(JSON.stringify(model)).not.toContain('workspaceMembers');
    expect(JSON.stringify(model)).not.toContain('availableLists');
    expect(getSharedTaskDescriptionText(response.task.description)).toBe(
      'Visible body'
    );
  });

  it('keeps editing catalogs in the edit-only dialog context', () => {
    const response: SharedTaskEditResponse = {
      ...baseResponse,
      permission: 'edit',
      boardConfig: { id: 'board-id', ws_id: 'workspace-id' },
      availableLists: [
        {
          id: 'list-id',
          name: 'Visible List',
          archived: false,
          deleted: false,
          created_at: '2026-08-01T00:00:00.000Z',
          board_id: 'board-id',
          creator_id: 'creator-id',
          status: 'not_started',
          color: 'GRAY',
          position: 1,
        },
      ],
      workspaceLabels: [
        {
          id: 'unrelated-label-id',
          name: 'Editor Label',
          color: '#654321',
          created_at: '2026-08-01T00:00:00.000Z',
        },
      ],
      workspaceProjects: [
        {
          id: 'unrelated-project-id',
          name: 'Editor Project',
          status: 'active',
        },
      ],
      workspaceMembers: [
        {
          id: 'unrelated-member-id',
          user_id: 'unrelated-member-id',
          display_name: 'Editor Person',
        },
      ],
    };
    const model = getSharedTaskContentModel(response);
    const lists = getSharedTaskEditLists(response);

    expect(model.kind).toBe('edit');
    expect(getSharedTaskEditContext(response, lists)).toEqual({
      boardConfig: response.boardConfig,
      availableLists: response.availableLists,
      workspaceLabels: response.workspaceLabels,
      workspaceMembers: response.workspaceMembers,
      workspaceProjects: response.workspaceProjects,
    });
  });
});
