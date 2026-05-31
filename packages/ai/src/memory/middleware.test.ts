import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withAiMemory } from './middleware';

const memoryMocks = vi.hoisted(() => ({
  isAiMemoryEnabledForScope: vi.fn(),
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
  });

  it('keeps AI SDK models unchanged when memory is enabled', async () => {
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
    ).resolves.toBe(model);

    expect(memoryMocks.isAiMemoryEnabledForScope).toHaveBeenCalledWith(
      expect.objectContaining({
        product: 'tasks',
        userId: 'user-1',
        wsId: 'ws-1',
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

    expect(memoryMocks.isAiMemoryEnabledForScope).toHaveBeenCalledWith(
      expect.objectContaining({
        product: 'mira',
        userId: 'user-1',
        wsId: 'ws-1',
      })
    );
  });
});
