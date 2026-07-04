import { expect, test } from '@playwright/test';
import {
  listWorkspaceLabels,
  listWorkspaceTaskBoardViewableMembers,
  listWorkspaceTaskProjectsByIds,
} from '../../../packages/internal-api/src/tasks';
import { getTaskCardResourceContext } from '../../../packages/ui/src/components/ui/tu-do/boards/boardId/task-card/task-card-resource-context';

test.describe('Tasks satellite source resource routing', () => {
  test('keeps source-task support APIs on the tasks origin and source workspace', async () => {
    const requestedUrls: string[] = [];
    const fetchMock: typeof fetch = async (input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      requestedUrls.push(url);

      return new Response(
        JSON.stringify(
          url.includes('/viewable-members') ? { members: [] } : []
        ),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    };

    const resourceContext = getTaskCardResourceContext({
      boardId: 'personal-board',
      pageWorkspaceId: 'personal-workspace',
      propAvailableLists: [
        {
          archived: false,
          board_id: 'personal-board',
          color: 'BLUE',
          created_at: '2026-07-04T00:00:00.000Z',
          creator_id: 'user-1',
          deleted: false,
          id: 'personal-list',
          name: 'Personal',
          position: 0,
          status: 'not_started',
        },
      ],
      task: {
        created_at: '2026-07-04T00:00:00.000Z',
        description: '',
        display_number: 1,
        end_date: null,
        id: 'task-1',
        list_id: 'personal-list',
        name: 'External task',
        priority: 'normal',
        projects: [{ id: 'source-project', name: 'Source project' }],
        source_board_id: 'source-board',
        source_workspace_id: 'source-workspace',
      },
    });

    expect(resourceContext).toMatchObject({
      boardViewableMembersBoardId: 'source-board',
      boardViewableMembersWorkspaceId: 'source-workspace',
      effectiveWorkspaceId: 'source-workspace',
      initialAvailableLists: undefined,
      taskBoardId: 'source-board',
    });

    const clientOptions = {
      baseUrl: 'https://tasks.tuturuuu.test',
      fetch: fetchMock,
    };

    await listWorkspaceLabels(
      resourceContext.effectiveWorkspaceId ?? '',
      clientOptions
    );
    await listWorkspaceTaskProjectsByIds(
      resourceContext.effectiveWorkspaceId ?? '',
      ['source-project'],
      clientOptions
    );
    await listWorkspaceTaskBoardViewableMembers(
      resourceContext.boardViewableMembersWorkspaceId ?? '',
      resourceContext.boardViewableMembersBoardId,
      clientOptions
    );

    expect(requestedUrls).toEqual([
      'https://tasks.tuturuuu.test/api/v1/workspaces/source-workspace/labels',
      'https://tasks.tuturuuu.test/api/v1/workspaces/source-workspace/task-projects?compact=true&ids=source-project',
      'https://tasks.tuturuuu.test/api/v1/workspaces/source-workspace/task-boards/source-board/viewable-members',
    ]);
    expect(requestedUrls.join('\n')).not.toContain('personal-workspace');
    expect(requestedUrls.join('\n')).not.toContain('https://tuturuuu.com');
  });
});
