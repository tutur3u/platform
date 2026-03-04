import { describe, expect, it } from 'vitest';
import { groupMessageParts } from '../group-message-parts';
import {
  getAssistantDisplayText,
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

  it('dedupes repeated attachments with the same storage identity', () => {
    expect(
      getRenderableMessageAttachments(
        {
          id: 'user-1',
          role: 'user',
          parts: [],
        } as never,
        new Map([
          [
            'user-1',
            [
              {
                id: 'dup-1',
                name: 'mira-audio.webm',
                previewUrl: 'blob:one',
                signedUrl: null,
                size: 42,
                storagePath: 'ws/chat/mira-audio.webm',
                type: 'audio/webm',
              },
              {
                id: 'dup-2',
                name: 'mira-audio.webm',
                previewUrl: null,
                signedUrl: 'https://example.com/audio.webm',
                size: 42,
                storagePath: 'ws/chat/mira-audio.webm',
                type: 'audio/webm',
              },
            ],
          ],
        ])
      )
    ).toEqual([
      expect.objectContaining({
        name: 'mira-audio.webm',
        previewUrl: 'blob:one',
        signedUrl: 'https://example.com/audio.webm',
        storagePath: 'ws/chat/mira-audio.webm',
        type: 'audio/webm',
      }),
    ]);
  });

  it('dedupes metadata attachments even when one side falls back to octet-stream', () => {
    expect(
      getRenderableMessageAttachments(
        {
          id: 'user-2',
          role: 'user',
          metadata: {
            attachments: [
              {
                alias: 'Recorded note',
                name: 'mira-audio.webm',
                size: 42,
                storagePath: 'ws/chat/mira-audio.webm',
                type: 'audio/webm',
              },
            ],
          },
          parts: [],
        } as never,
        new Map([
          [
            'user-2',
            [
              {
                id: 'octet-stream-copy',
                name: 'mira-audio.webm',
                previewUrl: null,
                signedUrl: 'https://example.com/audio.webm',
                size: 42,
                storagePath: 'ws/chat/mira-audio.webm',
                type: 'application/octet-stream',
              },
            ],
          ],
        ])
      )
    ).toEqual([
      expect.objectContaining({
        alias: 'Recorded note',
        name: 'mira-audio.webm',
        storagePath: 'ws/chat/mira-audio.webm',
        type: 'audio/webm',
      }),
    ]);
  });

  it('strips leading planner meta tool calls from assistant display text', () => {
    expect(
      getAssistantDisplayText({
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: '{"tools":["no_action_needed"]}\n\nHello there.',
          },
        ],
      } as never)
    ).toBe('Hello there.');

    expect(
      getAssistantDisplayText({
        id: 'assistant-2',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: 'select_tools(tools=["no_action_needed"])\n\nHello there.',
          },
        ],
      } as never)
    ).toBe('Hello there.');
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
