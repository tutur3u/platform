import { beforeEach, describe, expect, it, vi } from 'vitest';

const internalApiMocks = vi.hoisted(() => ({
  abortWorkspaceTaskDescriptionChunks: vi.fn(),
  appendWorkspaceTaskDescriptionChunk: vi.fn(),
  beginWorkspaceTaskDescriptionChunks: vi.fn(),
  commitWorkspaceTaskDescriptionChunks: vi.fn(),
  createWorkspaceTaskProject: vi.fn(),
  getWorkspaceTask: vi.fn(),
  getWorkspaceTaskDescription: vi.fn(),
  updateWorkspaceTask: vi.fn(),
  updateWorkspaceTaskDescription: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/tasks', () => internalApiMocks);

import {
  shouldChunkTaskDescriptionPayload,
  updateWorkspaceTaskDescription,
} from './task-api';

describe('task-api description persistence', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    internalApiMocks.abortWorkspaceTaskDescriptionChunks.mockResolvedValue({
      success: true,
    });
    internalApiMocks.appendWorkspaceTaskDescriptionChunk.mockResolvedValue({
      success: true,
    });
    internalApiMocks.beginWorkspaceTaskDescriptionChunks.mockResolvedValue({
      session_id: 'chunk-session-1',
    });
    internalApiMocks.commitWorkspaceTaskDescriptionChunks.mockResolvedValue({
      description: 'persisted',
      description_yjs_state: [1, 2, 3],
    });
    internalApiMocks.updateWorkspaceTaskDescription.mockResolvedValue({
      description: 'small',
      description_yjs_state: [1, 2, 3],
    });
  });

  it('uses the direct description update for small payloads', async () => {
    const payload = {
      description: JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ text: 'Small' }] }],
      }),
      description_yjs_state: [1, 2, 3],
    };

    await expect(
      updateWorkspaceTaskDescription('ws-1', 'task-1', payload)
    ).resolves.toEqual({
      description: 'small',
      description_yjs_state: [1, 2, 3],
    });

    expect(
      internalApiMocks.updateWorkspaceTaskDescription
    ).toHaveBeenCalledWith('ws-1', 'task-1', payload);
    expect(
      internalApiMocks.beginWorkspaceTaskDescriptionChunks
    ).not.toHaveBeenCalled();
  });

  it('uploads large description updates through ordered chunks', async () => {
    const yjsState = Array.from({ length: 220_000 }, (_, index) => index % 256);
    const payload = {
      description: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Large paste' }],
          },
        ],
      }),
      description_yjs_state: yjsState,
    };

    expect(shouldChunkTaskDescriptionPayload(payload)).toBe(true);

    await updateWorkspaceTaskDescription('ws-1', 'task-1', payload);

    expect(
      internalApiMocks.updateWorkspaceTaskDescription
    ).not.toHaveBeenCalled();
    expect(
      internalApiMocks.beginWorkspaceTaskDescriptionChunks
    ).toHaveBeenCalledWith(
      'ws-1',
      'task-1',
      expect.objectContaining({
        description: expect.objectContaining({
          chunk_count: 1,
        }),
        description_yjs_state: expect.objectContaining({
          chunk_count: expect.any(Number),
        }),
      })
    );

    const appendCalls =
      internalApiMocks.appendWorkspaceTaskDescriptionChunk.mock.calls;
    expect(appendCalls.length).toBeGreaterThan(2);
    expect(appendCalls[0]).toEqual([
      'ws-1',
      'task-1',
      expect.objectContaining({
        chunk_index: 0,
        field: 'description',
        session_id: 'chunk-session-1',
      }),
    ]);
    expect(
      appendCalls
        .filter((call) => call[2].field === 'description_yjs_state')
        .map((call) => call[2].chunk_index)
    ).toEqual(
      appendCalls
        .filter((call) => call[2].field === 'description_yjs_state')
        .map((_, index) => index)
    );
    expect(
      internalApiMocks.commitWorkspaceTaskDescriptionChunks
    ).toHaveBeenCalledWith('ws-1', 'task-1', 'chunk-session-1');
  });

  it('falls back to chunked upload when a direct save hits the proxy body limit', async () => {
    internalApiMocks.updateWorkspaceTaskDescription.mockRejectedValueOnce({
      status: 413,
    });

    await updateWorkspaceTaskDescription('ws-1', 'task-1', {
      description: 'small enough to try directly',
      description_yjs_state: [1, 2, 3],
    });

    expect(
      internalApiMocks.beginWorkspaceTaskDescriptionChunks
    ).toHaveBeenCalled();
    expect(
      internalApiMocks.commitWorkspaceTaskDescriptionChunks
    ).toHaveBeenCalled();
  });

  it('aborts the chunk session when an append fails', async () => {
    internalApiMocks.appendWorkspaceTaskDescriptionChunk.mockRejectedValueOnce(
      new Error('network down')
    );

    await expect(
      updateWorkspaceTaskDescription('ws-1', 'task-1', {
        description: 'x'.repeat(10),
        description_yjs_state: Array.from(
          { length: 220_000 },
          (_, index) => index % 256
        ),
      })
    ).rejects.toThrow('network down');

    expect(
      internalApiMocks.abortWorkspaceTaskDescriptionChunks
    ).toHaveBeenCalledWith('ws-1', 'task-1', 'chunk-session-1');
    expect(
      internalApiMocks.commitWorkspaceTaskDescriptionChunks
    ).not.toHaveBeenCalled();
  });
});
