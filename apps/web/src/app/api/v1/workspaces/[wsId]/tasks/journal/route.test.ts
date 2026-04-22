import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const workspaceMemberMaybeSingle = vi.fn();
const listMaybeSingle = vi.fn();
const tasksInsertSelect = vi.fn();
const workspaceLabelsEq = vi.fn();
const workspaceTaskLabelSingle = vi.fn();
const taskProjectsEq = vi.fn();
const taskProjectTasksInsert = vi.fn();
const taskLabelsInsert = vi.fn();
const taskAssigneesInsert = vi.fn();
const resolvePlanModel = vi.fn();
const checkAiCredits = vi.fn();
const generateObject = vi.fn();
const normalizeWorkspaceId = vi.fn();

const createQueryBuilder = (resolver: ReturnType<typeof vi.fn>) => ({
  eq: vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle: resolver,
    })),
  })),
});

const userClient = {
  auth: {
    getUser,
  },
  from: vi.fn((table: string) => {
    switch (table) {
      case 'workspace_members':
        return {
          select: vi.fn(() => createQueryBuilder(workspaceMemberMaybeSingle)),
        };
      case 'task_lists':
        return {
          select: vi.fn(() => createQueryBuilder(listMaybeSingle)),
        };
      case 'tasks':
        return {
          insert: vi.fn(() => ({
            select: tasksInsertSelect,
          })),
        };
      case 'workspace_task_labels':
        return {
          select: vi.fn(() => ({
            eq: workspaceLabelsEq,
          })),
        };
      case 'task_labels':
        return {
          insert: taskLabelsInsert,
        };
      case 'task_assignees':
        return {
          insert: taskAssigneesInsert,
        };
      case 'task_project_tasks':
        return {
          insert: taskProjectTasksInsert,
        };
      default:
        throw new Error(`Unexpected table: ${table}`);
    }
  }),
};

const adminClient = {
  from: vi.fn((table: string) => {
    switch (table) {
      case 'task_lists':
        return {
          select: vi.fn(() => createQueryBuilder(listMaybeSingle)),
        };
      case 'tasks':
        return {
          insert: vi.fn(() => ({
            select: tasksInsertSelect,
          })),
        };
      case 'workspace_task_labels':
        return {
          select: vi.fn(() => ({
            eq: workspaceLabelsEq,
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: workspaceTaskLabelSingle,
            })),
          })),
        };
      case 'task_projects':
        return {
          select: vi.fn(() => ({
            eq: taskProjectsEq,
          })),
        };
      case 'task_labels':
        return {
          insert: taskLabelsInsert,
        };
      case 'task_project_tasks':
        return {
          insert: taskProjectTasksInsert,
        };
      case 'task_assignees':
        return {
          insert: taskAssigneesInsert,
        };
      default:
        throw new Error(`Unexpected admin table: ${table}`);
    }
  }),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(adminClient)),
  createClient: vi.fn(() => Promise.resolve(userClient)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();
  return {
    ...actual,
    normalizeWorkspaceId: (...args: Parameters<typeof normalizeWorkspaceId>) =>
      normalizeWorkspaceId(...args),
  };
});

vi.mock('@tuturuuu/ai/credits/resolve-plan-model', () => ({
  PlanModelResolutionError: class PlanModelResolutionError extends Error {
    code: string;

    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  resolvePlanModel: (...args: Parameters<typeof resolvePlanModel>) =>
    resolvePlanModel(...args),
}));

vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: (...args: Parameters<typeof checkAiCredits>) =>
    checkAiCredits(...args),
  deductAiCredits: vi.fn(),
}));

vi.mock('ai', () => {
  return {
    NoObjectGeneratedError: class NoObjectGeneratedError extends Error {
      usage?: unknown;

      static isInstance(error: unknown) {
        return error instanceof NoObjectGeneratedError;
      }
    },
    generateObject: (...args: Parameters<typeof generateObject>) =>
      generateObject(...args),
  };
});

describe('task journal route', () => {
  beforeEach(() => {
    getUser.mockReset();
    workspaceMemberMaybeSingle.mockReset();
    listMaybeSingle.mockReset();
    tasksInsertSelect.mockReset();
    workspaceLabelsEq.mockReset();
    workspaceTaskLabelSingle.mockReset();
    taskProjectsEq.mockReset();
    taskProjectTasksInsert.mockReset();
    taskProjectTasksInsert.mockResolvedValue({
      error: null,
    });
    taskLabelsInsert.mockReset();
    taskLabelsInsert.mockResolvedValue({
      error: null,
    });
    taskAssigneesInsert.mockReset();
    taskAssigneesInsert.mockResolvedValue({
      error: null,
    });
    resolvePlanModel.mockReset();
    checkAiCredits.mockReset();
    generateObject.mockReset();
    normalizeWorkspaceId.mockReset();
    userClient.from.mockClear();
    adminClient.from.mockClear();
  });

  it('rejects task creation before list lookup when the user lacks workspace access', async () => {
    normalizeWorkspaceId.mockResolvedValue('ws-1');
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'dev@example.com' } },
      error: null,
    });
    workspaceMemberMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/tasks/journal/route'
    );
    const response = await POST(
      new Request('http://localhost/api/v1/workspaces/ws-1/tasks/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry: 'Follow up with the customer this week',
          listId: 'list-1',
          tasks: [
            {
              title: 'Follow up customer',
              description: null,
              priority: null,
              labels: [],
              dueDate: null,
              estimationPoints: null,
              projectIds: [],
            },
          ],
        }),
      }),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Workspace access denied',
    });
    expect(adminClient.from).not.toHaveBeenCalledWith('task_lists');
  });

  it('saves reviewed tasks without re-running AI resolution or credit checks', async () => {
    normalizeWorkspaceId.mockResolvedValue('ws-1');
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'dev@example.com' } },
      error: null,
    });
    workspaceMemberMaybeSingle.mockResolvedValue({
      data: { type: 'MEMBER' as const },
      error: null,
    });
    listMaybeSingle.mockResolvedValue({
      data: {
        id: 'list-1',
        name: 'Inbox',
      },
      error: null,
    });
    tasksInsertSelect.mockResolvedValue({
      data: [
        {
          id: 'task-1',
          name: 'Follow up customer',
          description: null,
          priority: null,
          completed: false,
          start_date: null,
          end_date: null,
          created_at: '2026-04-21T10:00:00.000Z',
          list_id: 'list-1',
          task_lists: {
            id: 'list-1',
            name: 'Inbox',
            board_id: 'board-1',
            workspace_boards: {
              id: 'board-1',
              name: 'Board',
              ws_id: 'ws-1',
            },
          },
        },
      ],
      error: null,
    });
    workspaceLabelsEq.mockResolvedValue({
      data: [],
      error: null,
    });
    taskProjectsEq.mockResolvedValue({
      data: [],
      error: null,
    });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/tasks/journal/route'
    );
    const response = await POST(
      new Request('http://localhost/api/v1/workspaces/ws-1/tasks/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry: 'Follow up with the customer this week',
          listId: 'list-1',
          tasks: [
            {
              title: 'Follow up customer',
              description: null,
              priority: null,
              labels: [],
              dueDate: null,
              estimationPoints: null,
              projectIds: [],
            },
          ],
          generatedWithAI: true,
          generateDescriptions: false,
          generatePriority: false,
          generateLabels: false,
        }),
      }),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      metadata: {
        generatedWithAI: true,
        totalTasks: 1,
      },
      tasks: [
        {
          id: 'task-1',
          name: 'Follow up customer',
        },
      ],
    });
    expect(resolvePlanModel).not.toHaveBeenCalled();
    expect(checkAiCredits).not.toHaveBeenCalled();
    expect(generateObject).not.toHaveBeenCalled();
    expect(tasksInsertSelect).toHaveBeenCalledTimes(1);
    expect(adminClient.from).toHaveBeenCalledWith('tasks');
    expect(userClient.from).not.toHaveBeenCalledWith('tasks');
  });

  it('loads workspace projects through the admin client after workspace access passes', async () => {
    normalizeWorkspaceId.mockResolvedValue('ws-1');
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'dev@example.com' } },
      error: null,
    });
    workspaceMemberMaybeSingle.mockResolvedValue({
      data: { type: 'MEMBER' as const },
      error: null,
    });
    listMaybeSingle.mockResolvedValue({
      data: {
        id: 'list-1',
        name: 'Inbox',
      },
      error: null,
    });
    taskProjectsEq.mockResolvedValue({
      data: [{ id: 'project-1' }],
      error: null,
    });
    taskProjectTasksInsert.mockResolvedValue({
      error: null,
    });
    tasksInsertSelect.mockResolvedValue({
      data: [
        {
          id: 'task-1',
          name: 'Follow up customer',
          description: null,
          priority: null,
          completed: false,
          start_date: null,
          end_date: null,
          created_at: '2026-04-21T10:00:00.000Z',
          list_id: 'list-1',
          task_lists: {
            id: 'list-1',
            name: 'Inbox',
            board_id: 'board-1',
            workspace_boards: {
              id: 'board-1',
              name: 'Board',
              ws_id: 'ws-1',
            },
          },
        },
      ],
      error: null,
    });
    workspaceLabelsEq.mockResolvedValue({
      data: [],
      error: null,
    });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/tasks/journal/route'
    );
    const response = await POST(
      new Request('http://localhost/api/v1/workspaces/ws-1/tasks/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry: 'Follow up with the customer this week',
          listId: 'list-1',
          tasks: [
            {
              title: 'Follow up customer',
              description: null,
              priority: null,
              labels: [],
              dueDate: null,
              estimationPoints: null,
              projectIds: ['project-1'],
            },
          ],
        }),
      }),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(201);
    expect(adminClient.from).toHaveBeenCalledWith('task_projects');
    expect(userClient.from).not.toHaveBeenCalledWith('task_projects');
  });

  it('normalizes personal workspace aliases before verifying list access', async () => {
    normalizeWorkspaceId.mockResolvedValue('ws-1');
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'dev@example.com' } },
      error: null,
    });
    workspaceMemberMaybeSingle.mockResolvedValue({
      data: { type: 'MEMBER' as const },
      error: null,
    });
    listMaybeSingle.mockResolvedValue({
      data: {
        id: 'list-1',
        name: 'Inbox',
      },
      error: null,
    });
    tasksInsertSelect.mockResolvedValue({
      data: [],
      error: null,
    });
    workspaceLabelsEq.mockResolvedValue({
      data: [],
      error: null,
    });
    taskProjectsEq.mockResolvedValue({
      data: [],
      error: null,
    });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/tasks/journal/route'
    );
    await POST(
      new Request('http://localhost/api/v1/workspaces/personal/tasks/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry: 'Follow up with the customer this week',
          listId: 'list-1',
          tasks: [
            {
              title: 'Follow up customer',
              description: null,
              priority: null,
              labels: [],
              dueDate: null,
              estimationPoints: null,
              projectIds: [],
            },
          ],
        }),
      }),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(normalizeWorkspaceId).toHaveBeenCalledWith('personal', userClient);
  });
});
