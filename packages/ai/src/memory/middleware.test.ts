import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withAiMemory } from './middleware';

const memoryMocks = vi.hoisted(() => ({
  isAiMemoryEnabledForScope: vi.fn(),
  withSupermemory: vi.fn(),
}));

vi.mock('@supermemory/tools/ai-sdk', () => ({
  withSupermemory: memoryMocks.withSupermemory,
}));

vi.mock('./config', () => ({
  getAiMemoryConfig: () => ({
    apiKey: 'test-key',
    baseUrl: 'http://supermemory.internal',
    enabled: true,
    failOpen: true,
    timeoutMs: 1500,
  }),
}));

vi.mock('./settings', () => ({
  isAiMemoryEnabledForScope: memoryMocks.isAiMemoryEnabledForScope,
}));

describe('withAiMemory', () => {
  const model = { modelId: 'test-model' } as never;

  beforeEach(() => {
    vi.clearAllMocks();
    memoryMocks.withSupermemory.mockReturnValue({ wrapped: true });
  });

  it('wraps AI SDK models with Supermemory metadata', async () => {
    memoryMocks.isAiMemoryEnabledForScope.mockResolvedValue(true);

    await expect(
      withAiMemory({
        customId: 'thread-1',
        model,
        product: 'tasks',
        source: 'task_journal',
        surface: 'task_journal',
        userId: 'user-1',
        wsId: 'ws-1',
      })
    ).resolves.toEqual({ wrapped: true });

    expect(memoryMocks.withSupermemory).toHaveBeenCalledWith(
      model,
      expect.objectContaining({
        addMemory: 'always',
        apiKey: 'test-key',
        baseUrl: 'http://supermemory.internal',
        containerTag: 'tuturuuu.user.user-1.workspace.ws-1',
        customId: 'tuturuuu.tasks.task_journal.thread-1',
        mode: 'full',
        skipMemoryOnError: true,
      })
    );
  });

  it('leaves the model unchanged when scope settings disable memory', async () => {
    memoryMocks.isAiMemoryEnabledForScope.mockResolvedValue(false);

    await expect(
      withAiMemory({
        model,
        product: 'mira',
        surface: 'chat',
        userId: 'user-1',
        wsId: 'ws-1',
      })
    ).resolves.toBe(model);

    expect(memoryMocks.withSupermemory).not.toHaveBeenCalled();
  });
});
