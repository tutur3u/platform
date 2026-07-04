import type { QueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import { MAX_TASK_DESCRIPTION_LENGTH } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const taskApiMocks = vi.hoisted(() => ({
  mockFetchWorkspaceTaskDescription: vi.fn(),
  mockUpdateWorkspaceTaskDescription: vi.fn(),
}));

vi.mock('./hooks/task-api', () => ({
  fetchWorkspaceTaskDescription: taskApiMocks.mockFetchWorkspaceTaskDescription,
  updateWorkspaceTaskDescription:
    taskApiMocks.mockUpdateWorkspaceTaskDescription,
}));

import {
  broadcastTaskDescriptionUpsert,
  buildTaskDescriptionUpdatePayload,
  canPersistTaskDescriptionSnapshot,
  createTaskDescriptionPersistenceGuardState,
  getTaskDescriptionPercentLeft,
  getTaskDescriptionPreviewText,
  getTaskDescriptionStorageLength,
  recordTaskDescriptionEditorSnapshot,
  saveAndVerifyYjsDescriptionToDatabase,
  saveYjsDescriptionToDatabase,
  serializeTaskDescriptionContent,
  serializeTaskDescriptionPersistenceSnapshot,
  updateTaskDescriptionCaches,
} from './utils';

describe('task edit dialog utils', () => {
  const content: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Hello world' }],
      },
    ],
  };
  const emptyContent: JSONContent = {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('serializes task description content', () => {
    expect(serializeTaskDescriptionContent(content)).toBe(
      JSON.stringify(content)
    );
  });

  it('blocks untrusted empty snapshots from clearing persisted content', () => {
    const guardState = createTaskDescriptionPersistenceGuardState({
      persistedDescription: JSON.stringify(content),
    });

    expect(
      canPersistTaskDescriptionSnapshot({
        currentSerializedDescription: null,
        guardState,
      })
    ).toBe(false);
    expect(
      canPersistTaskDescriptionSnapshot({
        currentSerializedDescription:
          serializeTaskDescriptionPersistenceSnapshot(emptyContent),
        guardState,
      })
    ).toBe(false);
  });

  it('allows no-op empty saves when the persisted description is already empty', () => {
    const guardState = createTaskDescriptionPersistenceGuardState({
      persistedDescription: null,
    });

    expect(
      canPersistTaskDescriptionSnapshot({
        currentSerializedDescription: null,
        guardState,
      })
    ).toBe(true);
  });

  it('allows confirmed intentional clears after observing non-empty editor content', () => {
    const initialGuardState = createTaskDescriptionPersistenceGuardState({
      persistedDescription: JSON.stringify(content),
    });

    const nonEmptySeenState = recordTaskDescriptionEditorSnapshot(
      initialGuardState,
      content
    );
    const confirmedClearState = recordTaskDescriptionEditorSnapshot(
      nonEmptySeenState,
      null,
      { canConfirmEmptySnapshot: true }
    );

    expect(
      canPersistTaskDescriptionSnapshot({
        currentSerializedDescription: null,
        guardState: confirmedClearState,
      })
    ).toBe(true);
  });

  it('does not confirm empty snapshots before editor clears are trusted', () => {
    const initialGuardState = createTaskDescriptionPersistenceGuardState({
      persistedDescription: JSON.stringify(content),
    });
    const nonEmptySeenState = recordTaskDescriptionEditorSnapshot(
      initialGuardState,
      content
    );
    const untrustedEmptyState = recordTaskDescriptionEditorSnapshot(
      nonEmptySeenState,
      null,
      { canConfirmEmptySnapshot: false }
    );

    expect(
      canPersistTaskDescriptionSnapshot({
        currentSerializedDescription: null,
        guardState: untrustedEmptyState,
      })
    ).toBe(false);
  });

  it('allows non-empty saves even when the guard has not observed hydration', () => {
    const guardState = createTaskDescriptionPersistenceGuardState({
      persistedDescription: JSON.stringify(content),
    });

    expect(
      canPersistTaskDescriptionSnapshot({
        currentSerializedDescription:
          serializeTaskDescriptionPersistenceSnapshot(content),
        guardState,
      })
    ).toBe(true);
  });

  it('returns zero for empty description storage length', () => {
    expect(getTaskDescriptionStorageLength(null)).toBe(0);
  });

  it('returns the serialized storage length for rich text content', () => {
    expect(getTaskDescriptionStorageLength(content)).toBe(
      JSON.stringify(content).length
    );
  });

  it('calculates percentage left within bounds', () => {
    expect(getTaskDescriptionPercentLeft(0, 100)).toBe(100);
    expect(getTaskDescriptionPercentLeft(15, 100)).toBe(85);
    expect(getTaskDescriptionPercentLeft(100, 100)).toBe(0);
    expect(getTaskDescriptionPercentLeft(120, 100)).toBe(0);
  });

  it('returns zero when description limit is invalid', () => {
    expect(getTaskDescriptionPercentLeft(0, 0)).toBe(0);
    expect(getTaskDescriptionPercentLeft(0, -10)).toBe(0);
  });

  it('keeps description in the update payload when within the cap', () => {
    expect(
      buildTaskDescriptionUpdatePayload({
        content,
        yjsState: [1, 2, 3],
      })
    ).toEqual({
      description: JSON.stringify(content),
      description_yjs_state: [1, 2, 3],
    });
  });

  it('drops oversized description strings while preserving yjs state', () => {
    const oversized: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x'.repeat(MAX_TASK_DESCRIPTION_LENGTH),
            },
          ],
        },
      ],
    };

    expect(
      buildTaskDescriptionUpdatePayload({
        content: oversized,
        yjsState: [9, 9, 9],
      })
    ).toEqual({
      description_yjs_state: [9, 9, 9],
    });
  });

  it('clears persisted description when the editor content is empty', () => {
    expect(
      buildTaskDescriptionUpdatePayload({
        content: null,
        yjsState: null,
      })
    ).toEqual({
      description: null,
      description_yjs_state: null,
    });
  });

  it('returns an empty payload for oversized descriptions without yjs state', () => {
    const oversized: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x'.repeat(MAX_TASK_DESCRIPTION_LENGTH),
            },
          ],
        },
      ],
    };

    expect(
      buildTaskDescriptionUpdatePayload({
        content: oversized,
      })
    ).toEqual({});
  });

  it('fails close persistence when description exceeds max length', async () => {
    const oversized: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x'.repeat(MAX_TASK_DESCRIPTION_LENGTH),
            },
          ],
        },
      ],
    };

    const result = await saveAndVerifyYjsDescriptionToDatabase({
      wsId: 'ws-1',
      taskId: 'task-1',
      getContent: () => oversized,
      getYjsState: () => [9, 9, 9],
      context: 'test-oversized-close',
    });

    expect(result).toBe(false);
    expect(
      taskApiMocks.mockUpdateWorkspaceTaskDescription
    ).not.toHaveBeenCalled();
  });

  it('updates task and board caches with the latest description string', () => {
    const task = {
      id: 'task-1',
      name: 'Task 1',
      description: null,
    };
    const queryClient = {
      setQueryData: (
        queryKey: unknown[],
        updater: (value: (typeof task)[] | typeof task | undefined) => unknown
      ) => {
        if (queryKey[0] === 'task') {
          const updated = updater(task) as typeof task;
          expect(updated.description).toBe(JSON.stringify(content));
          return updated;
        }

        const updated = updater([task]) as (typeof task)[];
        expect(updated[0]?.description).toBe(JSON.stringify(content));
        return updated;
      },
    };

    updateTaskDescriptionCaches({
      taskId: 'task-1',
      descriptionString: JSON.stringify(content),
      boardId: 'board-1',
      queryClient: queryClient as unknown as QueryClient,
    });
  });

  it('extracts plain text preview text from rich descriptions', () => {
    expect(getTaskDescriptionPreviewText(content)).toContain('Hello world');
  });

  it('saves and verifies the persisted description payload', async () => {
    taskApiMocks.mockUpdateWorkspaceTaskDescription.mockResolvedValueOnce({
      description: JSON.stringify(content),
      description_yjs_state: [1, 2, 3],
    });

    const result = await saveAndVerifyYjsDescriptionToDatabase({
      wsId: 'ws-1',
      taskId: 'task-1',
      getContent: () => content,
      getYjsState: () => [1, 2, 3],
      boardId: 'board-1',
      queryClient: { setQueryData: vi.fn() } as unknown as QueryClient,
      context: 'test',
    });

    expect(result).toBe(true);
    expect(
      taskApiMocks.mockUpdateWorkspaceTaskDescription
    ).toHaveBeenCalledWith('ws-1', 'task-1', {
      description: JSON.stringify(content),
      description_yjs_state: [1, 2, 3],
    });
    expect(
      taskApiMocks.mockFetchWorkspaceTaskDescription
    ).not.toHaveBeenCalled();
  });

  it('does not overwrite cached description when saving yjs-state-only payloads', async () => {
    taskApiMocks.mockUpdateWorkspaceTaskDescription.mockResolvedValueOnce({});
    const setQueryData = vi.fn();

    const oversized: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x'.repeat(MAX_TASK_DESCRIPTION_LENGTH),
            },
          ],
        },
      ],
    };

    const result = await saveYjsDescriptionToDatabase({
      wsId: 'ws-1',
      taskId: 'task-1',
      getContent: () => oversized,
      getYjsState: () => [9, 9, 9],
      boardId: 'board-1',
      queryClient: { setQueryData } as unknown as QueryClient,
      context: 'test-yjs-only',
    });

    expect(result).toBe(false);
    expect(
      taskApiMocks.mockUpdateWorkspaceTaskDescription
    ).not.toHaveBeenCalled();
    expect(setQueryData).not.toHaveBeenCalled();
  });

  it('fails verification when the restored description does not match', async () => {
    taskApiMocks.mockUpdateWorkspaceTaskDescription.mockResolvedValueOnce({
      description: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Stale content' }],
          },
        ],
      }),
      description_yjs_state: [1, 2, 3],
    });

    const result = await saveAndVerifyYjsDescriptionToDatabase({
      wsId: 'ws-1',
      taskId: 'task-1',
      getContent: () => content,
      getYjsState: () => [1, 2, 3],
      context: 'test-mismatch',
    });

    expect(result).toBe(false);
  });

  it('fails verification for oversized descriptions instead of sending yjs-only payload', async () => {
    const oversized: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x'.repeat(MAX_TASK_DESCRIPTION_LENGTH),
            },
          ],
        },
      ],
    };

    const result = await saveAndVerifyYjsDescriptionToDatabase({
      wsId: 'ws-1',
      taskId: 'task-1',
      getContent: () => oversized,
      getYjsState: () => [9, 9, 9],
      context: 'test-oversized',
    });

    expect(result).toBe(false);
    expect(
      taskApiMocks.mockUpdateWorkspaceTaskDescription
    ).not.toHaveBeenCalled();
    expect(
      taskApiMocks.mockFetchWorkspaceTaskDescription
    ).not.toHaveBeenCalled();
  });

  it('returns false when the update response does not confirm the payload', async () => {
    taskApiMocks.mockUpdateWorkspaceTaskDescription.mockResolvedValueOnce({
      description: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Stale content' }],
          },
        ],
      }),
      description_yjs_state: [1, 2, 3],
    });

    const result = await saveAndVerifyYjsDescriptionToDatabase({
      wsId: 'ws-1',
      taskId: 'task-1',
      getContent: () => content,
      getYjsState: () => [1, 2, 3],
      context: 'test-update-mismatch',
    });

    expect(result).toBe(false);
    expect(
      taskApiMocks.mockFetchWorkspaceTaskDescription
    ).not.toHaveBeenCalled();
  });

  it('allows close persistence when description matches but yjs state differs', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    taskApiMocks.mockUpdateWorkspaceTaskDescription.mockResolvedValueOnce({
      description: JSON.stringify(content),
      description_yjs_state: [3, 2, 1],
    });

    const result = await saveAndVerifyYjsDescriptionToDatabase({
      wsId: 'ws-1',
      taskId: 'task-1',
      getContent: () => content,
      getYjsState: () => [1, 2, 3],
      context: 'test-yjs-mismatch',
    });

    expect(result).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      'Task description Yjs state differed (test-yjs-mismatch)',
      expect.objectContaining({
        persistedYjsStateLength: 3,
        taskId: 'task-1',
        wsId: 'ws-1',
      })
    );
    warnSpy.mockRestore();
  });

  it('broadcasts task upsert payload for description cache updates', () => {
    const broadcast = vi.fn();
    const descriptionString = JSON.stringify(content);

    broadcastTaskDescriptionUpsert({
      taskId: 'task-1',
      descriptionString,
      broadcast,
    });

    expect(broadcast).toHaveBeenCalledWith('task:upsert', {
      task: {
        id: 'task-1',
        description: descriptionString,
      },
    });
  });
});
