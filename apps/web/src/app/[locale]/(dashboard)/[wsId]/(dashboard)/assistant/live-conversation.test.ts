import { expect, it } from 'vitest';
import { reduceLiveConversation } from './live-conversation';

it('keeps speech and tools interleaved while results update the original slot', () => {
  let messages = reduceLiveConversation(
    [],
    { type: 'text', role: 'user', text: 'Show tasks' },
    'user'
  );
  messages = reduceLiveConversation(
    messages,
    { type: 'text', role: 'assistant', text: 'Checking' },
    'assistant'
  );
  messages = reduceLiveConversation(
    messages,
    { type: 'tool', id: 'call', name: 'search_tasks', input: {} },
    'unused'
  );
  messages = reduceLiveConversation(
    messages,
    { type: 'text', role: 'assistant', text: 'Found them' },
    'unused'
  );
  messages = reduceLiveConversation(
    messages,
    { type: 'result', id: 'call', output: { success: true } },
    'unused'
  );
  expect(messages.map((item) => item.id)).toEqual(['user', 'assistant']);
  expect(messages[1]?.parts.map((part) => part.type)).toEqual([
    'text',
    'dynamic-tool',
    'text',
  ]);
  expect(messages[1]?.parts[1]).toMatchObject({
    state: 'output-available',
    output: { success: true },
  });
  expect(
    reduceLiveConversation(messages, { type: 'finish' }, '').every(
      (item) => item.complete
    )
  ).toBe(true);
});

it('marks interrupted tool calls as unresolved failures instead of leaving them running', () => {
  const pending = reduceLiveConversation(
    [],
    { type: 'tool', id: 'call', name: 'create_task', input: {} },
    'assistant'
  );
  const ended = reduceLiveConversation(
    pending,
    { type: 'finish', interrupted: true },
    'unused'
  );
  expect(ended[0]?.parts[0]).toMatchObject({ state: 'output-error' });
  expect(ended[0]?.complete).toBe(true);
});

it('attaches late search sources to the existing completed turn', () => {
  const spoken = reduceLiveConversation(
    [],
    { type: 'text', role: 'assistant', text: 'Here is the answer' },
    'assistant'
  );
  const complete = reduceLiveConversation(spoken, { type: 'finish' }, 'unused');
  const grounded = reduceLiveConversation(
    complete,
    { type: 'source', url: 'https://example.com', title: 'Source' },
    'unused'
  );
  expect(grounded).toHaveLength(1);
  expect(grounded[0]?.parts.map((part) => part.type)).toEqual([
    'text',
    'source-url',
  ]);
  expect(grounded[0]?.complete).toBe(true);
});

it('does not label failed or declined tool responses as completed actions', () => {
  const pending = reduceLiveConversation(
    [],
    { type: 'tool', id: 'call', name: 'create_task', input: {} },
    'assistant'
  );
  const failed = reduceLiveConversation(
    pending,
    { type: 'result', id: 'call', output: { error: 'Permission denied' } },
    'unused'
  );
  expect(failed[0]?.parts[0]).toMatchObject({
    state: 'output-error',
    errorText: 'Permission denied',
  });
  const declined = reduceLiveConversation(
    pending,
    {
      type: 'result',
      id: 'call',
      output: { cancelled: true, message: 'Declined' },
    },
    'unused'
  );
  expect(declined[0]?.parts[0]).toMatchObject({
    state: 'output-error',
    errorText: 'Declined',
  });
});

it('persists session notices as separate ordered timeline entries', () => {
  let messages = reduceLiveConversation(
    [],
    { type: 'notice', status: 'started', text: 'Started' },
    'start'
  );
  messages = reduceLiveConversation(
    messages,
    { type: 'text', role: 'user', text: 'Hello' },
    'user'
  );
  messages = reduceLiveConversation(
    messages,
    { type: 'notice', status: 'ended', text: 'Ended' },
    'end'
  );
  const restored = JSON.parse(JSON.stringify(messages));
  expect(restored.map((message: { id: string }) => message.id)).toEqual([
    'start',
    'user',
    'end',
  ]);
  expect(restored[2].parts[0]).toEqual({
    type: 'data-live-session',
    data: { status: 'ended', text: 'Ended' },
  });
  expect(
    restored.every((message: { complete: boolean }) => message.complete)
  ).toBe(true);
});
