import { describe, expect, it } from 'vitest';
import { groupMessageParts } from '../group-message-parts';
import { getRenderableMessageAttachments, hasToolParts } from '../helpers';

describe('chat message tool visibility', () => {
  it('hides select_tools errors from renderable tool output', () => {
    const parts = [
      {
        type: 'tool-select_tools',
        toolCallId: 'call-select-tools',
        state: 'output-error',
        input: {
          tools: ['get_my_tasks'],
        },
        errorText: '407 Error',
      },
    ] as never;

    expect(
      hasToolParts({
        id: 'assistant-message',
        role: 'assistant',
        parts,
      } as never)
    ).toBe(false);
    expect(groupMessageParts(parts)).toEqual([]);
  });

  it('keeps select_tools visible when it resolves to no_action_needed', () => {
    const parts = [
      {
        type: 'tool-select_tools',
        toolCallId: 'call-select-tools',
        state: 'output-available',
        input: {
          tools: ['no_action_needed'],
        },
        output: {
          selectedTools: ['no_action_needed'],
        },
      },
    ] as never;

    expect(
      hasToolParts({
        id: 'assistant-message',
        role: 'assistant',
        parts,
      } as never)
    ).toBe(true);
    expect(groupMessageParts(parts)).toMatchObject([
      {
        kind: 'tool',
        toolName: 'select_tools',
      },
    ]);
  });

  it('falls back to message metadata attachments when the attachment map is empty', () => {
    expect(
      getRenderableMessageAttachments({
        id: 'user-1',
        role: 'user',
        metadata: {
          attachments: [
            {
              alias: 'Quick note',
              name: '00000.wav',
              size: 42,
              storagePath: 'ws/chat/00000.wav',
              type: 'audio/wav',
            },
          ],
        },
        parts: [{ type: 'text', text: 'Please analyze the attached file(s).' }],
      } as never)
    ).toEqual([
      expect.objectContaining({
        alias: 'Quick note',
        name: '00000.wav',
        size: 42,
        storagePath: 'ws/chat/00000.wav',
        type: 'audio/wav',
      }),
    ]);
  });
});
