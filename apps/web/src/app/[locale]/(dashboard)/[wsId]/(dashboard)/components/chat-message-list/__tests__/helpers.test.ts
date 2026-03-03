import { describe, expect, it } from 'vitest';
import { groupMessageParts } from '../group-message-parts';
import {
  getRenderableMessageAttachments,
  hasToolParts,
  hasVisualToolPart,
  isNoActionSelectToolsPart,
} from '../helpers';

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

  it('keeps select_tools no-action parts hidden from the transcript', () => {
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
    ).toBe(false);
    expect(groupMessageParts(parts)).toEqual([]);
    expect(isNoActionSelectToolsPart(parts[0])).toBe(true);
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

  it('detects visual render_ui tool output separately', () => {
    expect(
      hasVisualToolPart({
        id: 'assistant-message',
        role: 'assistant',
        parts: [
          {
            type: 'tool-render_ui',
            toolCallId: 'call-render-ui',
            state: 'output-available',
            output: { spec: { root: 'r', elements: { r: { type: 'Card' } } } },
          },
        ],
      } as never)
    ).toBe(true);
  });
});
