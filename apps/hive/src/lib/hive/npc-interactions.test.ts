import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HiveNpcRow, HiveNpcRunRow, HiveWorld } from './types';

const mocks = vi.hoisted(() => {
  class MockHiveAiAccessError extends Error {
    constructor(
      message: string,
      public readonly status = 400
    ) {
      super(message);
      this.name = 'HiveAiAccessError';
    }
  }

  return {
    appendHiveNpcMemories: vi.fn(),
    checkAiCredits: vi.fn(),
    createHiveWorldEvent: vi.fn(),
    deductAiCredits: vi.fn(),
    ensureHiveResearchSchema: vi.fn(),
    generateObject: vi.fn(),
    getHiveNpc: vi.fn(),
    google: vi.fn(),
    HiveAiAccessError: MockHiveAiAccessError,
    listHiveNpcMemories: vi.fn(),
    persistHiveNpcRun: vi.fn(),
    resolveHiveAllowedModel: vi.fn(),
    resolveHiveCreditContext: vi.fn(),
    resolveHiveResearchSessionId: vi.fn(),
    serverLogger: {
      warn: vi.fn(),
    },
    toBareModelName: vi.fn(),
  };
});

const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

vi.mock('@ai-sdk/google', () => ({
  google: (...args: unknown[]) => mocks.google(...args),
}));

vi.mock('@tuturuuu/ai/core', () => ({
  generateObject: (...args: unknown[]) => mocks.generateObject(...args),
}));

vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: (...args: unknown[]) => mocks.checkAiCredits(...args),
  deductAiCredits: (...args: unknown[]) => mocks.deductAiCredits(...args),
}));

vi.mock('@tuturuuu/ai/credits/model-mapping', () => ({
  toBareModelName: (...args: unknown[]) => mocks.toBareModelName(...args),
}));

vi.mock('../infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

vi.mock('./ai', () => ({
  HiveAiAccessError: mocks.HiveAiAccessError,
  resolveHiveAllowedModel: (...args: unknown[]) =>
    mocks.resolveHiveAllowedModel(...args),
  resolveHiveCreditContext: (...args: unknown[]) =>
    mocks.resolveHiveCreditContext(...args),
}));

vi.mock('./hive-db', () => ({
  createHiveWorldEvent: (...args: unknown[]) =>
    mocks.createHiveWorldEvent(...args),
}));

vi.mock('./npcs', () => ({
  appendHiveNpcMemories: (...args: unknown[]) =>
    mocks.appendHiveNpcMemories(...args),
  getHiveNpc: (...args: unknown[]) => mocks.getHiveNpc(...args),
  listHiveNpcMemories: (...args: unknown[]) =>
    mocks.listHiveNpcMemories(...args),
  persistHiveNpcRun: (...args: unknown[]) => mocks.persistHiveNpcRun(...args),
}));

vi.mock('./research-schema', () => ({
  ensureHiveResearchSchema: (...args: unknown[]) =>
    mocks.ensureHiveResearchSchema(...args),
  resolveHiveResearchSessionId: (...args: unknown[]) =>
    mocks.resolveHiveResearchSessionId(...args),
}));

const sourceNpc: HiveNpcRow = {
  backstory: null,
  backstory_enabled: false,
  custom_prompt_enabled: false,
  id: '00000000-0000-4000-8000-000000000010',
  memory_enabled: true,
  model: 'google/gemini-2.5-flash-lite',
  name: 'Scout',
  position: { x: 1, y: 1, z: 1 },
  role: 'Village scout',
  server_id: '00000000-0000-4000-8000-000000000001',
  settings: {},
  system_prompt: null,
};

const world: HiveWorld = {
  blocks: [],
  objects: [],
};

const generatedConversation = {
  summary: 'Scout inspected the village.',
  turns: [
    {
      action: {
        target: { x: 2, y: 1, z: 1 },
        type: 'move' as const,
      },
      intent: 'Inspect the nearby path.',
      memoryWrites: ['Scout inspected the nearby path.'],
      rationale: 'The path is close and observable.',
      speakerNpcId: sourceNpc.id,
      spokenText: 'I will inspect the nearby path.',
      targetNpcId: null,
    },
  ],
  worldImpact: 'The village state remains unchanged.',
};

function completedRun(overrides: Partial<HiveNpcRunRow> = {}): HiveNpcRunRow {
  return {
    actor_user_id: '00000000-0000-4000-8000-000000000002',
    autonomous: false,
    created_at: '2026-05-19T00:00:00.000Z',
    credit_source: 'personal',
    credit_ws_id: '00000000-0000-4000-8000-000000000003',
    credits_deducted: 2.5,
    error: null,
    id: '00000000-0000-4000-8000-000000000020',
    input_context: {},
    input_tokens: 12,
    interaction_id: '00000000-0000-4000-8000-000000000030',
    llm_cost: 2.5,
    llm_model: 'google/gemini-2.5-flash-lite',
    llm_provider: 'google',
    npc_id: sourceNpc.id,
    output_decision: {},
    output_tokens: 24,
    prompt_mode: 'enhanced',
    reasoning_tokens: 3,
    status: 'completed',
    target_npc_id: null,
    trigger: 'manual',
    ...overrides,
  };
}

describe('runHiveNpcInteraction AI credit handling', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-google-key');

    mocks.appendHiveNpcMemories.mockReset();
    mocks.checkAiCredits.mockReset();
    mocks.createHiveWorldEvent.mockReset();
    mocks.deductAiCredits.mockReset();
    mocks.ensureHiveResearchSchema.mockReset();
    mocks.generateObject.mockReset();
    mocks.getHiveNpc.mockReset();
    mocks.google.mockReset();
    mocks.listHiveNpcMemories.mockReset();
    mocks.persistHiveNpcRun.mockReset();
    mocks.resolveHiveAllowedModel.mockReset();
    mocks.resolveHiveCreditContext.mockReset();
    mocks.resolveHiveResearchSessionId.mockReset();
    consoleWarnSpy.mockReset();
    mocks.toBareModelName.mockReset();

    mocks.ensureHiveResearchSchema.mockResolvedValue(undefined);
    mocks.resolveHiveResearchSessionId.mockResolvedValue(null);
    mocks.getHiveNpc.mockResolvedValue(sourceNpc);
    mocks.listHiveNpcMemories.mockResolvedValue([]);
    mocks.resolveHiveCreditContext.mockResolvedValue({
      creditSource: 'personal',
      creditWsId: '00000000-0000-4000-8000-000000000003',
    });
    mocks.resolveHiveAllowedModel.mockResolvedValue(
      'google/gemini-2.5-flash-lite'
    );
    mocks.checkAiCredits.mockResolvedValue({
      allowed: true,
      errorCode: null,
      errorMessage: null,
      maxOutputTokens: null,
      remainingCredits: 10,
      tier: 'FREE',
    });
    mocks.toBareModelName.mockReturnValue('gemini-2.5-flash-lite');
    mocks.google.mockReturnValue({ modelId: 'gemini-2.5-flash-lite' });
    mocks.generateObject.mockResolvedValue({
      object: generatedConversation,
      usage: {
        inputTokens: 12,
        outputTokenDetails: { reasoningTokens: 3 },
        outputTokens: 24,
      },
    });
    mocks.createHiveWorldEvent.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000040',
    });
  });

  it('throws and does not persist provider output when credit deduction fails', async () => {
    const { runHiveNpcInteraction } = await import('./npc-interactions');

    mocks.deductAiCredits.mockResolvedValue({
      creditsDeducted: 0,
      errorCode: 'INSUFFICIENT_CREDITS',
      remainingCredits: 0,
      success: false,
    });

    await expect(
      runHiveNpcInteraction({
        actorUserId: '00000000-0000-4000-8000-000000000002',
        expectedRevision: 1,
        sbAdmin: {} as never,
        serverId: sourceNpc.server_id,
        sourceNpcId: sourceNpc.id,
        world,
      })
    ).rejects.toMatchObject({
      message: 'AI credits unavailable',
      status: 402,
    });

    expect(mocks.generateObject).toHaveBeenCalledTimes(1);
    expect(mocks.deductAiCredits).toHaveBeenCalledTimes(1);
    expect(mocks.persistHiveNpcRun).not.toHaveBeenCalled();
    expect(mocks.createHiveWorldEvent).not.toHaveBeenCalled();
    expect(mocks.appendHiveNpcMemories).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Hive AI credit deduction failed',
      expect.objectContaining({
        errorCode: 'INSUFFICIENT_CREDITS',
        modelId: 'google/gemini-2.5-flash-lite',
        wsId: '00000000-0000-4000-8000-000000000003',
      })
    );
  });

  it('persists completed runs when provider output is successfully billed', async () => {
    const { runHiveNpcInteraction } = await import('./npc-interactions');
    const run = completedRun();

    mocks.deductAiCredits.mockResolvedValue({
      creditsDeducted: 2.5,
      errorCode: null,
      remainingCredits: 7.5,
      success: true,
    });
    mocks.persistHiveNpcRun.mockResolvedValue(run);

    const result = await runHiveNpcInteraction({
      actorUserId: '00000000-0000-4000-8000-000000000002',
      expectedRevision: 1,
      sbAdmin: {} as never,
      serverId: sourceNpc.server_id,
      sourceNpcId: sourceNpc.id,
      world,
    });

    expect(result.runs).toEqual([run]);
    expect(mocks.persistHiveNpcRun).toHaveBeenCalledWith(
      expect.objectContaining({
        creditsDeducted: 2.5,
        llmCost: 2.5,
        llmModel: 'google/gemini-2.5-flash-lite',
        llmProvider: 'google',
        status: 'completed',
      })
    );
    expect(mocks.createHiveWorldEvent).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).not.toHaveBeenCalledWith(
      'Hive AI credit deduction failed',
      expect.anything()
    );
  });
});
