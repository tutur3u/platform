import { describe, expect, it } from 'vitest';
import { getPendingAssistantStatus } from '../pending-assistant-status';

const t = (key: string, values?: Record<string, number | string>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

describe('pending assistant status', () => {
  it('prefers attachment-specific copy for fresh audio uploads', () => {
    expect(
      getPendingAssistantStatus({
        messageAttachments: new Map([
          [
            'user-1',
            [
              {
                id: 'att-1',
                name: 'recording.webm',
                previewUrl: null,
                signedUrl: null,
                size: 128,
                storagePath: 'ws/chat/recording.webm',
                type: 'audio/webm',
              },
            ],
          ],
        ]),
        messages: [
          {
            id: 'user-1',
            role: 'user',
            parts: [],
          },
        ] as never,
        t,
      }).title
    ).toBe('thinking_status_audio_title');
  });

  it('surfaces the active file tool instead of the generic state', () => {
    expect(
      getPendingAssistantStatus({
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-load_chat_file',
                toolCallId: 'call-1',
              },
            ],
          },
        ] as never,
        t,
      }).title
    ).toBe('thinking_status_load_chat_file_title');
  });

  it('switches to the final writing state when only no-action planner parts exist', () => {
    expect(
      getPendingAssistantStatus({
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-select_tools',
                toolCallId: 'call-1',
                output: { ok: true, selectedTools: ['no_action_needed'] },
                state: 'output-available',
              },
              {
                type: 'step-start',
              },
            ],
          },
        ] as never,
        t,
      }).title
    ).toBe('thinking_status_finalizing_title');
  });
});
