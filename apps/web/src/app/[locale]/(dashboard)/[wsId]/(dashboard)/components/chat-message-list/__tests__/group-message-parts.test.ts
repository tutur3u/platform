import { describe, expect, it } from 'vitest';
import { groupMessageParts } from '../group-message-parts';

describe('groupMessageParts', () => {
  it('drops repeated no_action select_tools parts from visible grouping', () => {
    const groups = groupMessageParts([
      {
        type: 'tool-select_tools',
        toolCallId: 'call-1',
        state: 'output-available',
        output: { ok: true, selectedTools: ['no_action_needed'] },
      },
      {
        type: 'step-start',
      },
      {
        type: 'tool-select_tools',
        toolCallId: 'call-2',
        state: 'output-available',
        output: { ok: true, selectedTools: ['no_action_needed'] },
      },
    ] as never);

    expect(groups).toEqual([
      {
        index: 1,
        kind: 'other',
      },
    ]);
  });
});
