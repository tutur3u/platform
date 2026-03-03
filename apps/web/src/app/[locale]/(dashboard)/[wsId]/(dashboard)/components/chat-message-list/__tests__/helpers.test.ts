import { describe, expect, it } from 'vitest';
import { groupMessageParts } from '../group-message-parts';
import { hasToolParts } from '../helpers';

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
});
