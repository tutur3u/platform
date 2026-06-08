import { describe, expect, it } from 'vitest';
import { updateTaskDescriptionSchema } from './schema';

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
