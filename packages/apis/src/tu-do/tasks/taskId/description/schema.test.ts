import { describe, expect, it } from 'vitest';
import {
  MAX_TASK_DESCRIPTION_CHUNK_TEXT_LENGTH,
  MAX_TASK_DESCRIPTION_CHUNKS_PER_FIELD,
  MAX_TASK_DESCRIPTION_YJS_STATE_BASE64_LENGTH,
  taskDescriptionChunkRequestSchema,
  updateTaskDescriptionSchema,
} from './schema';

describe('updateTaskDescriptionSchema', () => {
  it('accepts plain text descriptions', () => {
    const result = updateTaskDescriptionSchema.safeParse({
      description: 'Plain task notes',
    });

    expect(result.success).toBe(true);
  });

  it('rejects editor JSON with unsupported nodes', () => {
    const result = updateTaskDescriptionSchema.safeParse({
      description: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'unsupportedNode',
            content: [{ type: 'text', text: 'Invalid node' }],
          },
        ],
      }),
    });

    expect(result.success).toBe(false);
  });

  it('keeps Yjs state payloads as lightweight byte arrays at schema parse time', () => {
    const result = updateTaskDescriptionSchema.safeParse({
      description_yjs_state: [1, 2, 3],
    });

    expect(result.success).toBe(true);
  });
});

describe('taskDescriptionChunkRequestSchema', () => {
  it('accepts begin requests for description and Yjs state chunks', () => {
    const result = taskDescriptionChunkRequestSchema.safeParse({
      action: 'begin',
      fields: {
        description: {
          chunk_count: 2,
          total_length: 1200,
        },
        description_yjs_state: {
          chunk_count: 3,
          total_length: 2400,
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts null field plans without chunks', () => {
    const result = taskDescriptionChunkRequestSchema.safeParse({
      action: 'begin',
      fields: {
        description: {
          chunk_count: 0,
          is_null: true,
          total_length: 0,
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects non-null fields without chunks', () => {
    const result = taskDescriptionChunkRequestSchema.safeParse({
      action: 'begin',
      fields: {
        description: {
          chunk_count: 0,
          total_length: 0,
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects chunk counts outside the supported range', () => {
    const result = taskDescriptionChunkRequestSchema.safeParse({
      action: 'begin',
      fields: {
        description_yjs_state: {
          chunk_count: MAX_TASK_DESCRIPTION_CHUNKS_PER_FIELD + 1,
          total_length: 1024,
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects field sizes beyond their final policy limits', () => {
    const result = taskDescriptionChunkRequestSchema.safeParse({
      action: 'begin',
      fields: {
        description_yjs_state: {
          chunk_count: 1,
          total_length: MAX_TASK_DESCRIPTION_YJS_STATE_BASE64_LENGTH + 1,
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it('accepts bounded append, commit, and abort requests', () => {
    expect(
      taskDescriptionChunkRequestSchema.safeParse({
        action: 'append',
        chunk: 'x'.repeat(MAX_TASK_DESCRIPTION_CHUNK_TEXT_LENGTH),
        chunk_index: 0,
        field: 'description',
        session_id: '00000000-0000-4000-8000-000000000001',
      }).success
    ).toBe(true);
    expect(
      taskDescriptionChunkRequestSchema.safeParse({
        action: 'commit',
        session_id: '00000000-0000-4000-8000-000000000001',
      }).success
    ).toBe(true);
    expect(
      taskDescriptionChunkRequestSchema.safeParse({
        action: 'abort',
        session_id: '00000000-0000-4000-8000-000000000001',
      }).success
    ).toBe(true);
  });

  it('rejects oversized append chunks', () => {
    const result = taskDescriptionChunkRequestSchema.safeParse({
      action: 'append',
      chunk: 'x'.repeat(MAX_TASK_DESCRIPTION_CHUNK_TEXT_LENGTH + 1),
      chunk_index: 0,
      field: 'description',
      session_id: '00000000-0000-4000-8000-000000000001',
    });

    expect(result.success).toBe(false);
  });
});
