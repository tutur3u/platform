import { describe, expect, it } from 'vitest';
import { restoreMessages } from './mira-chat-persistence-utils';

describe('Mira history chronology', () => {
  it('restores canonical parts rather than regrouping legacy metadata', () => {
    const parts = [
      { type: 'step-start' },
      { type: 'text', text: 'Checking' },
      {
        type: 'dynamic-tool',
        toolName: 'search_tasks',
        toolCallId: 'one',
        state: 'output-available',
        input: {},
        output: { tasks: [] },
      },
      { type: 'step-start' },
      { type: 'text', text: 'No matches' },
    ];
    const row = {
      id: 'message',
      role: 'ASSISTANT',
      content: 'Checking\n\nNo matches',
      metadata: { ai: { parts }, toolCalls: [{ toolCallId: 'legacy' }] },
    };
    expect(
      restoreMessages(JSON.parse(JSON.stringify([row])))[0]?.parts
    ).toEqual(parts);
  });
  it('restores compacted text spans without moving or losing later events', () => {
    const parts = Array.from({ length: 12 }, (_, index) => ({
      type: 'dynamic-tool',
      toolName: 'lookup',
      toolCallId: `call-${index}`,
      state: 'output-available',
    }));
    const restored = restoreMessages([
      {
        id: 'message',
        role: 'ASSISTANT',
        content: 'Before\n\nAfter',
        metadata: {
          ai: {
            parts: [
              { type: 'text', textStart: 0, textLength: 6 },
              ...parts,
              { type: 'text', textStart: 8, textLength: 5 },
            ],
          },
        },
      },
    ]);
    expect(restored[0]?.parts).toEqual([
      { type: 'text', text: 'Before' },
      ...parts,
      { type: 'text', text: 'After' },
    ]);
  });
  it('retains tool-only records with canonical metadata and null content', () => {
    expect(
      restoreMessages([
        {
          id: 'message',
          role: 'ASSISTANT',
          content: null,
          metadata: { ai: { parts: [{ type: 'step-start' }] } },
        },
      ])
    ).toHaveLength(1);
  });
});
