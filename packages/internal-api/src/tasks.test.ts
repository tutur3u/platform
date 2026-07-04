import { describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceLabel,
  createWorkspaceTaskBoard,
  createWorkspaceTaskJournal,
  deleteWorkspaceLabel,
  deleteWorkspaceTaskBoard,
  deleteWorkspaceTaskProject,
  disableWorkspaceTaskBoardPublicLink,
  enableWorkspaceTaskBoardPublicLink,
  getPublicTaskBoard,
  getTaskDialogHydration,
  getWorkspaceBoardsData,
  getWorkspaceTaskBoard,
  getWorkspaceTaskBoardPublicLink,
  getWorkspaceTaskProjectTasks,
  linkWorkspaceTaskProjectTask,
  listCurrentUserTaskBoards,
  listWorkspaceBoardsWithLists,
  listWorkspaceLabels,
  listWorkspaceTaskBoards,
  listWorkspaceTaskBoardViewableMembers,
  listWorkspaceTaskLists,
  listWorkspaceTaskProjectDetails,
  listWorkspaceTasks,
  partitionTaskProjectLinks,
  removeCurrentUserTaskPersonalPlacement,
  searchWorkspaceTasks,
  unlinkWorkspaceTaskProjectTask,
  updateWorkspaceLabel,
  updateWorkspaceTaskBoard,
  updateWorkspaceTaskBoardEstimation,
  upsertCurrentUserTaskPersonalPlacement,
} from './tasks';

function createJsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}

describe('workspace board internal-api helpers', () => {
  it('lists workspace task boards with query params', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ boards: [], count: 0 }));

    await listWorkspaceTaskBoards(
      'ws-1',
      { q: 'alpha', page: 2, pageSize: 25, status: 'archived' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/task-boards?q=alpha&page=2&pageSize=25&status=archived',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('lists current user accessible task boards', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        boards: [
          {
            access_type: 'guest',
            id: 'board-1',
            name: 'Shared Board',
            ws_id: 'ws-1',
          },
        ],
      })
    );

    await listCurrentUserTaskBoards({
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/users/me/task-boards',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('creates workspace task board via POST JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        board: { id: 'board-1', ws_id: 'ws-1', name: 'Board 1' },
      })
    );

    await createWorkspaceTaskBoard(
      'ws-1',
      { name: 'Board 1', template_id: 'template-1' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/task-boards',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Board 1', template_id: 'template-1' }),
        cache: 'no-store',
      })
    );
  });

  it('creates workspace tasks from the journal route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        tasks: [{ id: 'task-1', name: 'Follow up' }],
        metadata: { generatedWithAI: true, totalTasks: 1 },
      })
    );

    await createWorkspaceTaskJournal(
      'ws-1',
      {
        entry: 'Follow up with finance tomorrow',
        listId: 'list-1',
        assigneeIds: ['user-1'],
        generateDescriptions: true,
        generateLabels: true,
        generatePriority: true,
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/tasks/journal',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          entry: 'Follow up with finance tomorrow',
          listId: 'list-1',
          assigneeIds: ['user-1'],
          generateDescriptions: true,
          generateLabels: true,
          generatePriority: true,
        }),
        cache: 'no-store',
      })
    );
  });

  it('searches workspace tasks through the semantic search route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        tasks: [{ id: 'task-1', name: 'Deadline review' }],
      })
    );

    await searchWorkspaceTasks(
      'ws-1',
      {
        query: 'deadline review',
        matchCount: 20,
        matchThreshold: 0.3,
        mode: 'text',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/tasks/search',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          query: 'deadline review',
          matchCount: 20,
          matchThreshold: 0.3,
          mode: 'text',
        }),
        cache: 'no-store',
      })
    );
  });

  it('updates and deletes workspace task board via board endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ message: 'success' }))
      .mockResolvedValueOnce(createJsonResponse({ message: 'success' }));

    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await updateWorkspaceTaskBoard(
      'ws-1',
      'board-1',
      { name: 'Renamed', ticket_prefix: 'ABC' },
      options
    );

    await deleteWorkspaceTaskBoard('ws-1', 'board-1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-boards/board-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'Renamed', ticket_prefix: 'ABC' }),
      })
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-boards/board-1',
      expect.objectContaining({
        method: 'DELETE',
        cache: 'no-store',
      })
    );
  });

  it('updates workspace task board estimation via estimation endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        id: 'board-1',
        name: 'Planning',
        estimation_type: 'fibonacci',
        extended_estimation: true,
        allow_zero_estimates: true,
        count_unestimated_issues: false,
        created_at: '2026-05-17T00:00:00.000Z',
      })
    );

    await updateWorkspaceTaskBoardEstimation(
      'ws-1',
      'board-1',
      {
        estimation_type: 'fibonacci',
        extended_estimation: true,
        allow_zero_estimates: true,
        count_unestimated_issues: false,
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/boards/board-1/estimation',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          estimation_type: 'fibonacci',
          extended_estimation: true,
          allow_zero_estimates: true,
          count_unestimated_issues: false,
        }),
        cache: 'no-store',
      })
    );
  });

  it('fetches board data endpoints for board list/details', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ data: [], count: 0 }))
      .mockResolvedValueOnce(createJsonResponse({ boards: [] }))
      .mockResolvedValueOnce(
        createJsonResponse({
          board: { id: 'board-1', ws_id: 'ws-1', name: 'Board 1' },
        })
      );

    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await getWorkspaceBoardsData(
      'ws-1',
      { q: 'x', page: 1, pageSize: 10 },
      options
    );
    await listWorkspaceBoardsWithLists('ws-1', options);
    await getWorkspaceTaskBoard('ws-1', 'board-1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws-1/boards-data?q=x&page=1&pageSize=10',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws-1/boards-with-lists',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-boards/board-1',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('manages workspace task board public links', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          publicLink: {
            board_id: 'board-1',
            code: 'public-code',
            enabled: true,
            id: 'link-1',
          },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          publicLink: {
            board_id: 'board-1',
            code: 'public-code',
            enabled: true,
            id: 'link-1',
          },
        })
      )
      .mockResolvedValueOnce(createJsonResponse({ success: true }));

    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await getWorkspaceTaskBoardPublicLink('ws-1', 'board-1', options);
    await enableWorkspaceTaskBoardPublicLink('ws-1', 'board-1', options);
    await disableWorkspaceTaskBoardPublicLink('ws-1', 'board-1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-boards/board-1/public-link',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-boards/board-1/public-link',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-boards/board-1/public-link',
      expect.objectContaining({
        method: 'DELETE',
        cache: 'no-store',
      })
    );
  });

  it('loads a public task board through the shared public endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        board: {
          id: 'board-1',
          name: 'Public roadmap',
          created_at: '2026-06-24T00:00:00.000Z',
        },
        generatedAt: '2026-06-24T01:00:00.000Z',
        lists: [],
        tasks: [],
        truncated: false,
      })
    );

    await getPublicTaskBoard('Shared Code', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/shared/task-boards/Shared%20Code',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('lists workspace task board viewable members', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        members: [
          {
            display_name: 'Project Manager',
            id: 'user-1',
            user_id: 'user-1',
          },
        ],
      })
    );

    await listWorkspaceTaskBoardViewableMembers('ws-1', 'board-1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/task-boards/board-1/viewable-members',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('lists workspace task lists through the board lists route', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ lists: [] }));

    await listWorkspaceTaskLists('ws-1', 'board-1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/task-boards/board-1/lists',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('hydrates an external task dialog through the source workspace task and list routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          task: {
            id: 'task-1',
            name: 'External source task',
            list_id: 'list-1',
            board_id: 'board-1',
            display_number: 12,
            created_at: '2026-06-12T00:00:00.000Z',
          },
          taskWsId: 'source-ws',
          taskWorkspacePersonal: false,
          taskWorkspaceTier: 'PRO',
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          lists: [
            {
              id: 'list-1',
              board_id: 'board-1',
              name: 'Todo',
              status: 'not_started',
              deleted: false,
            },
          ],
        })
      );

    const response = await getTaskDialogHydration(
      'task-1',
      {
        taskWsId: 'source-ws',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/source-ws/tasks/task-1',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/source-ws/task-boards/board-1/lists',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/users/me/'))
    ).toBe(false);
    expect(response).toMatchObject({
      task: {
        id: 'task-1',
        name: 'External source task',
      },
      availableLists: [
        {
          id: 'list-1',
          board_id: 'board-1',
        },
      ],
      taskWsId: 'source-ws',
      taskWorkspacePersonal: false,
      taskWorkspaceTier: 'PRO',
    });
  });

  it('hydrates a user task dialog through the current user route when no source workspace is known', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        task: {
          id: 'task-1',
          name: 'User task',
          list_id: 'list-1',
          display_number: 12,
          created_at: '2026-06-12T00:00:00.000Z',
        },
        availableLists: [],
        taskWsId: 'workspace-1',
        taskWorkspacePersonal: true,
        taskWorkspaceTier: 'FREE',
      })
    );

    const response = await getTaskDialogHydration(
      'task-1',
      {},
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/users/me/tasks/task-1',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(response).toMatchObject({
      task: { id: 'task-1', name: 'User task' },
      taskWsId: 'workspace-1',
      taskWorkspacePersonal: true,
      taskWorkspaceTier: 'FREE',
    });
  });

  it('lists workspace tasks with task state filters', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ tasks: [] }));

    await listWorkspaceTasks(
      'ws-1',
      {
        completed: 'exclude',
        closed: 'exclude',
        forTimeTracking: true,
        includeArchivedBoards: true,
        limit: 50,
        listStatuses: ['not_started', 'active'],
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/tasks?listStatuses=not_started%2Cactive&limit=50&completed=exclude&closed=exclude&forTimeTracking=true&includeArchivedBoards=true',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('lists workspace tasks with non-document project link statuses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ tasks: [] }));

    await listWorkspaceTasks(
      'ws-1',
      {
        limit: 200,
        listStatuses: ['not_started', 'active', 'review', 'done', 'closed'],
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/tasks?listStatuses=not_started%2Cactive%2Creview%2Cdone%2Cclosed&limit=200',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('partitions task project links into work tasks and documents', () => {
    const result = partitionTaskProjectLinks([
      {
        task: {
          id: 'task-1',
          name: 'Ship milestone',
          completed_at: '2026-01-01T00:00:00.000Z',
          closed_at: null,
          deleted_at: null,
          priority: 'high',
          task_lists: { name: 'Doing', status: 'active' },
        },
      },
      {
        task: {
          id: 'doc-1',
          name: 'Launch notes',
          completed_at: null,
          closed_at: null,
          deleted_at: null,
          priority: 'normal',
          task_lists: { name: 'Docs', status: 'documents' },
        },
      },
      {
        task: {
          id: 'deleted-1',
          name: 'Removed',
          deleted_at: '2026-01-02T00:00:00.000Z',
          task_lists: { name: 'Done', status: 'done' },
        },
      },
    ]);

    expect(result.linkedTasks.map((task) => task.id)).toEqual(['task-1']);
    expect(result.linkedDocuments.map((task) => task.id)).toEqual(['doc-1']);
    expect(result.tasksCount).toBe(1);
    expect(result.completedTasksCount).toBe(1);
  });

  it('uses task project detail helpers for project data and linking', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createJsonResponse({ tasks: [], documents: [], lists: [] })
      );
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await listWorkspaceTaskProjectDetails('ws-1', options);
    await getWorkspaceTaskProjectTasks('ws-1', 'project-1', options);
    await linkWorkspaceTaskProjectTask('ws-1', 'project-1', 'task-1', options);
    await unlinkWorkspaceTaskProjectTask(
      'ws-1',
      'project-1',
      'task-1',
      options
    );
    await deleteWorkspaceTaskProject('ws-1', 'project-1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-projects',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-projects/project-1/tasks',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-projects/project-1/tasks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ taskId: 'task-1' }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-projects/project-1/tasks/task-1',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-projects/project-1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('lists workspace tasks assigned to the current user', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ tasks: [] }));

    await listWorkspaceTasks(
      'ws-1',
      {
        assignedToMe: true,
        completed: 'exclude',
        closed: 'exclude',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/tasks?assignedToMe=true&completed=exclude&closed=exclude',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('serializes the due-date presence task filter', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ tasks: [], count: 0 }));

    await listWorkspaceTasks(
      'ws-1',
      {
        boardId: 'board-1',
        hasDueDate: true,
        includeCount: true,
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/tasks?boardId=board-1&hasDueDate=true&includeCount=true',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('serializes task source filter controls', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ tasks: [] }));

    await listWorkspaceTasks(
      'ws-1',
      {
        boardId: 'board-1',
        sourceBoardIds: ['board-2', 'board-3'],
        sourceScope: 'external_specific',
        sourceWorkspaceIds: ['ws-2', 'ws-3'],
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/tasks?boardId=board-1&sourceScope=external_specific&sourceWorkspaceIds=ws-2%2Cws-3&sourceBoardIds=board-2%2Cboard-3',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('serializes server-side task board search and filter controls', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ tasks: [], listCounts: [] }));

    await listWorkspaceTasks(
      'ws-1',
      {
        assigneeIds: ['user-1', 'user-2'],
        boardId: 'board-1',
        dueDateFrom: '2026-06-01',
        dueDateTo: '2026-06-30',
        estimationMax: 8,
        estimationMin: 3,
        includeListCounts: true,
        includeUnassigned: true,
        labelIds: ['label-1'],
        limit: 0,
        priorities: ['high', 'critical'],
        projectIds: ['project-1'],
        q: 'Launch',
        sortBy: 'name-asc',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/tasks?boardId=board-1&q=Launch&limit=0&labelIds=label-1&assigneeIds=user-1%2Cuser-2&projectIds=project-1&priorities=high%2Ccritical&estimationMin=3&estimationMax=8&dueDateFrom=2026-06-01&dueDateTo=2026-06-30&includeUnassigned=true&sortBy=name-asc&includeListCounts=true',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('lists workspace tasks with external lane controls', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ tasks: [] }));

    await listWorkspaceTasks(
      'personal',
      {
        listId: 'personal-external-staging:board-1',
        externalIncludeDocuments: true,
        externalIncludeDoneClosed: true,
        externalSortBy: 'due-asc',
        limit: 50,
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/personal/tasks?listId=personal-external-staging%3Aboard-1&limit=50&externalIncludeDocuments=true&externalIncludeDoneClosed=true&externalSortBy=due-asc',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('updates and removes current-user personal task placements', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ task: { id: 'task-1' } }))
      .mockResolvedValueOnce(createJsonResponse({ success: true }));

    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await upsertCurrentUserTaskPersonalPlacement(
      'task-1',
      {
        personal_board_id: 'board-1',
        personal_list_id: null,
        personal_sort_key: null,
      },
      options
    );

    await removeCurrentUserTaskPersonalPlacement('task-1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/users/me/tasks/task-1/personal-placement',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          personal_board_id: 'board-1',
          personal_list_id: null,
          personal_sort_key: null,
        }),
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/users/me/tasks/task-1/personal-placement',
      expect.objectContaining({
        method: 'DELETE',
        cache: 'no-store',
      })
    );
  });

  it('manages workspace labels through backend label routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse([
        {
          id: 'label-1',
          ws_id: 'internal',
          name: 'Bug',
          color: 'red',
          created_at: '2026-03-20T00:00:00.000Z',
        },
      ])
    );

    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await listWorkspaceLabels('internal', options);
    await createWorkspaceLabel(
      'internal',
      { name: 'Feature', color: '#3B82F6' },
      options
    );
    await updateWorkspaceLabel(
      'internal',
      'label-1',
      { name: 'Bug', color: '#EF4444' },
      options
    );
    await deleteWorkspaceLabel('internal', 'label-1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/internal/labels',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/internal/labels',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Feature', color: '#3B82F6' }),
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/internal/labels/label-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Bug', color: '#EF4444' }),
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/workspaces/internal/labels/label-1',
      expect.objectContaining({
        method: 'DELETE',
        cache: 'no-store',
      })
    );
  });
});
