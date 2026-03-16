import type { JSONContent } from '@tiptap/react';
import { MAX_TASK_DESCRIPTION_LENGTH } from '@tuturuuu/utils/constants';
import { describe, expect, it } from 'vitest';
import {
  buildTaskDescriptionUpdatePayload,
  getTaskDescriptionPreviewText,
  getTaskDescriptionStorageLength,
  serializeTaskDescriptionContent,
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

  it('serializes task description content', () => {
    expect(serializeTaskDescriptionContent(content)).toBe(
      JSON.stringify(content)
    );
  });

  it('returns zero for empty description storage length', () => {
    expect(getTaskDescriptionStorageLength(null)).toBe(0);
  });

  it('returns the serialized storage length for rich text content', () => {
    expect(getTaskDescriptionStorageLength(content)).toBe(
      JSON.stringify(content).length
    );
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
      queryClient: queryClient as any,
    });
  });

  it('extracts plain text preview text from rich descriptions', () => {
    expect(getTaskDescriptionPreviewText(content)).toContain('Hello world');
  });
});
