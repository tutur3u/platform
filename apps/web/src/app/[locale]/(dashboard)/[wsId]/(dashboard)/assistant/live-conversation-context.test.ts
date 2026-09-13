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
