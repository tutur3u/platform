import { expect, it } from 'vitest';
import { buildLiveConversationContext } from './live-conversation-context';

it('keeps the newest context in chronological order within the voice budget', () => {
  const messages = ['oldest', 'middle', 'latest'].map((text, index) => ({
    id: String(index),
    role: 'user' as const,
    parts: [{ type: 'text' as const, text }],
  }));
  expect(
    buildLiveConversationContext(messages, 12).map(
      (turn) => turn.parts[0]?.text
    )
  ).toEqual(['middle', 'latest']);
  expect(messages).toHaveLength(3);
});
it('includes static and dynamic tool results so voice can ground follow-up questions', () => {
  const turns = buildLiveConversationContext([
    {
      id: 'assistant',
      role: 'assistant',
      parts: [
        {
          type: 'tool-create_task',
          toolCallId: 'call',
          state: 'output-available',
          input: {},
          output: { taskId: 'task', workspaceId: 'personal' },
        },
      ],
    },
  ]);
  expect(turns[0]?.parts[0]?.text).toContain('create_task');
  expect(turns[0]?.parts[0]?.text).toContain('personal');
});

it('includes failed tool results in voice context', () => {
  const context = buildLiveConversationContext([
    {
      id: 'failed',
      role: 'assistant',
      parts: [
        {
          type: 'dynamic-tool',
          toolName: 'create_task',
          toolCallId: 'call',
          input: {},
          state: 'output-error',
          errorText: 'Permission denied',
        },
      ],
    },
  ]);
  expect(JSON.stringify(context)).toContain('Permission denied');
  expect(JSON.stringify(context)).toContain('output-error');
});

it('retains earlier goals alongside recent turns without exceeding the context budget', () => {
  const messages = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    role: 'user' as const,
    parts: [
      {
        type: 'text' as const,
        text:
          i === 0
            ? 'Important goal: prepare the product launch'
            : `Turn ${i}: ${'context '.repeat(400)}`,
      },
    ],
  }));
  const context = buildLiveConversationContext(messages, 8000);
  const text = context
    .flatMap((turn) => turn.parts.map((part) => part.text))
    .join('');
  expect(text).toContain('Important goal');
  expect(text).toContain('Turn 29');
  expect(text.length).toBeLessThanOrEqual(8000);
});
