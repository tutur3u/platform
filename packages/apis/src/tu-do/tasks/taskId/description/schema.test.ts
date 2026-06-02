import { convertJsonContentToYjsState } from '@tuturuuu/utils/yjs-helper';
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

  it('rejects Yjs state that decodes to unsupported editor nodes', () => {
    const malformedState = convertJsonContentToYjsState({
      type: 'doc',
      content: [
        {
          type: 'unsupportedNode',
          content: [{ type: 'text', text: 'Invalid node' }],
        },
      ],
    });

    const result = updateTaskDescriptionSchema.safeParse({
      description_yjs_state: Array.from(malformedState),
    });

    expect(result.success).toBe(false);
  });
});
