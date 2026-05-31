import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MiraToolContext } from '../mira-tools';
import {
  executeDeleteMemory,
  executeListMemories,
  executeMergeMemories,
  executeRecall,
  executeRemember,
} from './memory';

const memoryMocks = vi.hoisted(() => ({
  forgetAiMemory: vi.fn(),
  listAiMemories: vi.fn(),
  rememberAiMemory: vi.fn(),
  resolveAiMemoryScope: vi.fn(),
  searchAiMemories: vi.fn(),
}));

vi.mock('../../memory', () => memoryMocks);

function createContext(
  overrides: Partial<MiraToolContext> = {}
): MiraToolContext {
  return {
    chatId: 'chat-1',
    supabase: {} as MiraToolContext['supabase'],
    timezone: 'Asia/Saigon',
    userId: 'user-1',
    wsId: 'ws-1',
    ...overrides,
  };
}

describe('Mira memory tool compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memoryMocks.resolveAiMemoryScope.mockReturnValue({
      containerTag: 'tuturuuu.user.user-1.workspace.ws-1',
      customId: 'tuturuuu.mira.mira_chat.chat-1',
      metadata: {},
      product: 'mira',
      surface: 'mira_chat',
      userId: 'user-1',
      wsId: 'ws-1',
    });
  });

  it('keeps remember tool arguments while writing through AI memory', async () => {
    memoryMocks.rememberAiMemory.mockResolvedValue({
      ok: true,
      value: { id: 'memory-1', status: 'queued' },
    });

    const result = await executeRemember(
      {
        category: 'preference',
        key: 'favorite_music',
        value: 'listens to synthwave',
      },
      createContext()
    );

    expect(result).toMatchObject({ action: 'created', success: true });
    expect(memoryMocks.resolveAiMemoryScope).toHaveBeenCalledWith(
      expect.objectContaining({
        customId: 'chat-1',
        product: 'mira',
        userId: 'user-1',
        wsId: 'ws-1',
      })
    );
    expect(memoryMocks.rememberAiMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'preference',
        key: 'favorite_music',
        value: 'listens to synthwave',
      })
    );
  });

  it('recalls searched AI memories without changing output shape', async () => {
    memoryMocks.searchAiMemories.mockResolvedValue({
      ok: true,
      value: [
        {
          id: 'memory-1',
          key: 'favorite_music',
          metadata: { memoryCategory: 'preference' },
          score: 0.91,
          updatedAt: '2026-05-31T00:00:00.000Z',
          value: 'favorite_music: synthwave',
        },
      ],
    });

    const result = await executeRecall(
      {
        maxResults: 5,
        query: 'favorite music',
      },
      createContext()
    );

    expect(result).toMatchObject({
      count: 1,
      memories: [
        {
          category: 'preference',
          key: 'favorite_music',
          value: 'favorite_music: synthwave',
        },
      ],
    });
    expect(memoryMocks.searchAiMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 5,
        query: 'favorite music',
      })
    );
    expect(memoryMocks.searchAiMemories).not.toHaveBeenCalledWith(
      expect.objectContaining({
        includeProductFilter: false,
      })
    );
  });

  it('lists and deletes existing Mira memories through stable tool names', async () => {
    memoryMocks.listAiMemories.mockResolvedValue({
      ok: true,
      value: [
        {
          category: 'fact',
          content: 'key: value',
          id: 'memory-1',
          key: 'key',
          metadata: {},
          status: 'done',
          title: null,
          updatedAt: '2026-05-31T00:00:00.000Z',
        },
      ],
    });
    memoryMocks.forgetAiMemory.mockResolvedValue({
      ok: true,
      value: { forgotten: true, id: 'memory-1' },
    });

    await expect(
      executeListMemories({}, createContext())
    ).resolves.toMatchObject({
      count: 1,
      memories: [{ key: 'key', value: 'key: value' }],
    });
    await expect(
      executeDeleteMemory({ key: 'key' }, createContext())
    ).resolves.toMatchObject({ success: true });

    expect(memoryMocks.listAiMemories).toHaveBeenCalledTimes(1);
    expect(memoryMocks.forgetAiMemory).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'key' })
    );
  });

  it('merge_memories writes the merged memory and forgets superseded keys', async () => {
    memoryMocks.rememberAiMemory.mockResolvedValue({
      ok: true,
      value: { id: 'memory-new', status: 'queued' },
    });
    memoryMocks.forgetAiMemory.mockResolvedValue({
      ok: true,
      value: { forgotten: true, id: 'memory-old' },
    });

    const result = await executeMergeMemories(
      {
        keysToDelete: ['old-a', 'new-key', 'old-b'],
        newCategory: 'fact',
        newKey: 'new-key',
        newValue: 'merged value',
      },
      createContext()
    );

    expect(result).toMatchObject({ success: true });
    expect(memoryMocks.rememberAiMemory).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'new-key', value: 'merged value' })
    );
    expect(memoryMocks.forgetAiMemory).toHaveBeenCalledTimes(2);
  });
});
