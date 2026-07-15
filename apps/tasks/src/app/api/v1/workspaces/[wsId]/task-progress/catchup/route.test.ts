import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capMaxOutputTokensByCredits: vi.fn(),
  checkAiCredits: vi.fn(),
  deductAiCredits: vi.fn(),
  ensureDefaultTaskProgressMetrics: vi.fn(),
  generateObject: vi.fn(),
  google: vi.fn(),
  gateway: vi.fn(),
  loadAutonomousTaskProgressEntries: vi.fn(),
  resolveTaskProgressRouteAuth: vi.fn(),
  resolvePlanModel: vi.fn(),
  withAiMemory: vi.fn(),
}));

function buildAdminClient() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'user_workspace_configs') {
        let configId = '';
        const query = {
          eq: vi.fn((column: string, value: string) => {
            if (column === 'id') configId = value;
            return query;
          }),
          maybeSingle: vi.fn(async () => ({
            data:
              configId === 'TASK_PROGRESS_AI_CATCHUPS'
                ? { value: 'true' }
                : configId === 'TASK_PROGRESS_CATCHUP_CADENCE'
                  ? { value: 'both' }
                  : null,
            error: null,
          })),
          select: vi.fn(() => query),
          upsert: vi.fn(async () => ({ error: null })),
        };
        return query;
      }

      if (table === 'task_progress_metrics') {
        const query = {
          eq: vi.fn(() => query),
          is: vi.fn(() => query),
          limit: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: { id: 'metric-1', unit_kind: 'tasks' },
            error: null,
          })),
          order: vi.fn(() => query),
          select: vi.fn(() => query),
        };
        return query;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

vi.mock('@ai-sdk/google', () => ({
  google: (...args: Parameters<typeof mocks.google>) => mocks.google(...args),
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
    code = 'NO_ALLOCATION';
  },
  resolvePlanModel: (...args: Parameters<typeof mocks.resolvePlanModel>) =>
    mocks.resolvePlanModel(...args),
}));

vi.mock('@tuturuuu/ai/memory', () => ({
  withAiMemory: (...args: Parameters<typeof mocks.withAiMemory>) =>
    mocks.withAiMemory(...args),
}));

vi.mock('../_autonomous', () => ({
  isAutonomousTaskMetric: vi.fn(() => true),
  loadAutonomousTaskProgressEntries: (
    ...args: Parameters<typeof mocks.loadAutonomousTaskProgressEntries>
  ) => mocks.loadAutonomousTaskProgressEntries(...args),
}));

vi.mock('../_insights', () => ({
  buildTaskProgressInsights: vi.fn(() => ({ forecast: 3 })),
}));

vi.mock('../_utils', () => ({
  ensureDefaultTaskProgressMetrics: (
    ...args: Parameters<typeof mocks.ensureDefaultTaskProgressMetrics>
  ) => mocks.ensureDefaultTaskProgressMetrics(...args),
  resolveTaskProgressRouteAuth: (
    ...args: Parameters<typeof mocks.resolveTaskProgressRouteAuth>
  ) => mocks.resolveTaskProgressRouteAuth(...args),
  TASK_PROGRESS_METRIC_SELECT: 'id, unit_kind',
}));

vi.mock('ai', () => ({
  gateway: (...args: Parameters<typeof mocks.gateway>) =>
    mocks.gateway(...args),
  generateObject: (...args: Parameters<typeof mocks.generateObject>) =>
    mocks.generateObject(...args),
  NoObjectGeneratedError: { isInstance: vi.fn(() => false) },
}));

describe('task progress catch-up route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const sbAdmin = buildAdminClient();
    mocks.resolveTaskProgressRouteAuth.mockResolvedValue({
      sbAdmin,
      user: { id: 'user-1' },
      wsId: 'ws-1',
    });
    mocks.ensureDefaultTaskProgressMetrics.mockResolvedValue(undefined);
    mocks.loadAutonomousTaskProgressEntries.mockResolvedValue([
      {
        created_by: 'user-1',
        effectiveValue: 2,
        entry_date: '2026-07-14',
      },
    ]);
    mocks.resolvePlanModel.mockResolvedValue({
      modelId: 'google/gemini-3.1-flash-lite',
    });
    mocks.checkAiCredits.mockResolvedValue({
      allowed: true,
      maxOutputTokens: 800,
      remainingCredits: 100,
    });
    mocks.capMaxOutputTokensByCredits.mockResolvedValue(800);
    mocks.gateway.mockImplementation((modelId: string) => ({
      modelId,
      provider: 'gateway',
    }));
    mocks.google.mockImplementation((modelId: string) => ({
      modelId,
      provider: 'google',
    }));
    mocks.withAiMemory.mockImplementation(async ({ model }) => model);
    mocks.generateObject.mockResolvedValue({
      object: {
        executiveSummary: 'Steady progress this week.',
        highlights: ['Two tasks completed'],
        nextActions: ['Continue the current plan'],
        watchouts: [],
      },
      usage: { inputTokens: 10, outputTokens: 20 },
    });
    mocks.deductAiCredits.mockResolvedValue(undefined);
  });

  it('generates through the resolved AI Gateway model', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/catchup', {
        body: JSON.stringify({ period: 'weekly', locale: 'en' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.gateway).toHaveBeenCalledWith('google/gemini-3.1-flash-lite');
    expect(mocks.google).not.toHaveBeenCalled();
    expect(mocks.withAiMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ provider: 'gateway' }),
      })
    );
  });
});
