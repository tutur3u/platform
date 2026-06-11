import { beforeEach, describe, expect, it, vi } from 'vitest';

const BOARD_ID = '00000000-0000-4000-8000-000000000001';
const LIST_ID = '00000000-0000-4000-8000-000000000002';
const FALLBACK_LIST_ID = '00000000-0000-4000-8000-000000000003';
const LABEL_ID = '00000000-0000-4000-8000-000000000004';
const PROJECT_ID = '00000000-0000-4000-8000-000000000005';

const mocks = vi.hoisted(() => ({
  board: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Product',
    estimation_type: 'fibonacci' as string | null,
    extended_estimation: false,
    allow_zero_estimates: false,
  },
  lists: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Inbox',
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      name: 'Next',
    },
  ],
  labels: [
    {
      id: '00000000-0000-4000-8000-000000000004',
      name: 'Launch',
      color: 'blue',
      created_at: '2026-06-11T00:00:00.000Z',
    },
  ],
  projects: [
    {
      id: '00000000-0000-4000-8000-000000000005',
      name: 'Website',
      status: 'active',
    },
  ],
  capMaxOutputTokensByCredits: vi.fn(),
  checkAiCredits: vi.fn(),
  deductAiCredits: vi.fn(),
  generateObject: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  resolvePlanModel: vi.fn(),
  serverLogger: {
    error: vi.fn(),
  },
  verifyWorkspaceMembershipType: vi.fn(),
  withAiMemory: vi.fn(),
}));

function buildAdminClient() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'workspace_boards') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({ data: mocks.board, error: null })
                ),
              })),
            })),
          })),
        };
      }

      if (table === 'task_lists') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn(() =>
                    Promise.resolve({ data: mocks.lists, error: null })
                  ),
                })),
              })),
            })),
          })),
        };
      }

      if (table === 'workspace_task_labels') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() =>
                Promise.resolve({ data: mocks.labels, error: null })
              ),
            })),
          })),
        };
      }

      if (table === 'task_projects') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() =>
                Promise.resolve({ data: mocks.projects, error: null })
              ),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

vi.mock('@ai-sdk/google', () => ({
  google: vi.fn((modelId: string) => ({ modelId })),
}));

vi.mock('@tuturuuu/ai/credits/cap-output-tokens', () => ({
  capMaxOutputTokensByCredits: (
    ...args: Parameters<typeof mocks.capMaxOutputTokensByCredits>
  ) => mocks.capMaxOutputTokensByCredits(...args),
}));

vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: (...args: Parameters<typeof mocks.checkAiCredits>) =>
    mocks.checkAiCredits(...args),
  deductAiCredits: (...args: Parameters<typeof mocks.deductAiCredits>) =>
    mocks.deductAiCredits(...args),
}));

vi.mock('@tuturuuu/ai/credits/resolve-plan-model', () => ({
  PlanModelResolutionError: class PlanModelResolutionError extends Error {
    code: string;

    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  resolvePlanModel: (...args: Parameters<typeof mocks.resolvePlanModel>) =>
    mocks.resolvePlanModel(...args),
}));

vi.mock('@tuturuuu/ai/memory', () => ({
  withAiMemory: (...args: Parameters<typeof mocks.withAiMemory>) =>
    mocks.withAiMemory(...args),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof mocks.resolveAuthenticatedSessionUser>
  ) => mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(buildAdminClient())),
  createClient: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();
  return {
    ...actual,
    normalizeWorkspaceId: (
      ...args: Parameters<typeof mocks.normalizeWorkspaceId>
    ) => mocks.normalizeWorkspaceId(...args),
    verifyWorkspaceMembershipType: (
      ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
    ) => mocks.verifyWorkspaceMembershipType(...args),
  };
});

vi.mock('ai', () => {
  class NoObjectGeneratedError extends Error {
    usage?: unknown;

    static isInstance(error: unknown) {
      return error instanceof NoObjectGeneratedError;
    }
  }

  return {
    NoObjectGeneratedError,
    generateObject: (...args: Parameters<typeof mocks.generateObject>) =>
      mocks.generateObject(...args),
  };
});

async function callRoute(body: Record<string, unknown>) {
  const { POST } = await import(
    '@/app/api/v1/workspaces/[wsId]/tasks/suggestions/route'
  );

  return POST(
    new Request('http://localhost/api/v1/workspaces/ws-1/tasks/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ wsId: 'ws-1' }) }
  );
}

describe('task suggestions route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.board = {
      id: BOARD_ID,
      name: 'Product',
      estimation_type: 'fibonacci',
      extended_estimation: false,
      allow_zero_estimates: false,
    };
    mocks.lists = [
      { id: LIST_ID, name: 'Inbox' },
      { id: FALLBACK_LIST_ID, name: 'Next' },
    ];
    mocks.labels = [
      {
        id: LABEL_ID,
        name: 'Launch',
        color: 'blue',
        created_at: '2026-06-11T00:00:00.000Z',
      },
    ];
    mocks.projects = [{ id: PROJECT_ID, name: 'Website', status: 'active' }];
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1' },
      authError: null,
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      ok: true,
      type: 'MEMBER',
    });
    mocks.resolvePlanModel.mockResolvedValue({ modelId: 'google/gemini-test' });
    mocks.checkAiCredits.mockResolvedValue({
      allowed: true,
      remainingCredits: 100,
      maxOutputTokens: 1200,
    });
    mocks.capMaxOutputTokensByCredits.mockResolvedValue(1200);
    mocks.deductAiCredits.mockResolvedValue(undefined);
    mocks.withAiMemory.mockImplementation(async ({ model }) => model);
    mocks.generateObject.mockResolvedValue({
      object: {
        tasks: [
          {
            title: 'Prepare launch checklist',
            description: 'Confirm owners and dates.',
            priority: 'high',
            listId: LIST_ID,
            labelIds: [LABEL_ID],
            projectIds: [PROJECT_ID],
            endDate: '2026-06-12',
            estimationPoints: 3,
            durationMinutes: 91,
            isSplittable: true,
            minSplitDurationMinutes: 30,
            maxSplitDurationMinutes: 60,
            calendarHours: 'work_hours',
            autoSchedule: true,
            reason: 'Launch work has a clear deadline.',
          },
        ],
      },
      usage: { inputTokens: 10, outputTokens: 20 },
    });
  });

  it('returns a sanitized single suggestion', async () => {
    const response = await callRoute({
      boardId: BOARD_ID,
      prompt: 'prepare launch checklist by tomorrow',
      currentListId: FALLBACK_LIST_ID,
      clientTimezone: 'Asia/Ho_Chi_Minh',
      clientTimestamp: '2026-06-11T09:00:00.000Z',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      metadata: { generatedWithAI: true, totalTasks: 1 },
      tasks: [
        {
          title: 'Prepare launch checklist',
          priority: 'high',
          listId: LIST_ID,
          labelIds: [LABEL_ID],
          projectIds: [PROJECT_ID],
          estimationPoints: 3,
          durationMinutes: 90,
          calendarHours: 'work_hours',
          autoSchedule: true,
        },
      ],
    });
    expect(mocks.generateObject).toHaveBeenCalledTimes(1);
    expect(mocks.deductAiCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'task_journal',
        inputTokens: 10,
        outputTokens: 20,
      })
    );
  });

  it('falls back invalid lists and filters invalid labels and projects', async () => {
    mocks.generateObject.mockResolvedValueOnce({
      object: {
        tasks: [
          {
            title: 'Clean up launch notes',
            listId: 'foreign-list',
            labelIds: [LABEL_ID, 'foreign-label'],
            projectIds: ['foreign-project'],
          },
        ],
      },
      usage: null,
    });

    const response = await callRoute({
      boardId: BOARD_ID,
      prompt: 'clean up launch notes',
      currentListId: FALLBACK_LIST_ID,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tasks: [
        {
          listId: FALLBACK_LIST_ID,
          labelIds: [LABEL_ID],
          projectIds: [],
        },
      ],
    });
  });

  it('omits estimation when the board has no estimation config', async () => {
    mocks.board = {
      ...mocks.board,
      estimation_type: null,
    };

    const response = await callRoute({
      boardId: BOARD_ID,
      prompt: 'prepare launch checklist',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tasks: [{ estimationPoints: null }],
    });
  });

  it('returns 403 before generation when credits are insufficient', async () => {
    mocks.checkAiCredits.mockResolvedValueOnce({
      allowed: false,
      errorMessage: 'AI credits insufficient',
      errorCode: 'CREDITS_EXHAUSTED',
    });

    const response = await callRoute({
      boardId: BOARD_ID,
      prompt: 'prepare launch checklist',
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'AI credits insufficient',
      code: 'CREDITS_EXHAUSTED',
    });
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });
});
