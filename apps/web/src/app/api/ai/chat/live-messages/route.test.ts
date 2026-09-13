import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  chats: [
    { id: '11111111-1111-4111-8111-111111111111', creator_id: 'owner' },
  ] as Record<string, unknown>[],
  messages: [] as Record<string, unknown>[],
  adminCalls: 0,
}));
function client() {
  return {
    from(table: string) {
      const rows = table === 'ai_chats' ? state.chats : state.messages;
      const filters: ((row: Record<string, unknown>) => boolean)[] = [];
      let action = 'select';
      let values: Record<string, unknown> = {};
      let single = false;
      let descending = false;
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push((row) => row[key] === value);
          return query;
        },
        in(key: string, ids: unknown[]) {
          filters.push((row) => ids.includes(row[key]));
          return query;
        },
        order() {
          descending = true;
          return query;
        },
        limit() {
          return query;
        },
        maybeSingle() {
          single = true;
          return query;
        },
        insert(value: Record<string, unknown>) {
          action = 'insert';
          values = value;
          return query;
        },
        upsert(value: Record<string, unknown>) {
          action = 'upsert';
          values = value;
          return query;
        },
        update(value: Record<string, unknown>) {
          action = 'update';
          values = value;
          return query;
        },
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally thenable.
        then(resolve: (result: unknown) => unknown) {
          // Mirror the explicit constraints restored by 20260601210819.
          if (
            table === 'ai_chat_messages' &&
            action !== 'select' &&
            typeof values.content === 'string' &&
            (Array.from(values.content).length > 10000 ||
              new TextEncoder().encode(values.content).byteLength > 40000)
          ) {
            return Promise.resolve(
              resolve({
                data: null,
                error: { message: 'content limit exceeded' },
              })
            );
          }
          if (action === 'insert' || action === 'upsert') {
            if (!rows.some((row) => row.id === values.id)) rows.push(values);
          }
          let matches = rows.filter((row) =>
            filters.every((filter) => filter(row))
          );
          if (action === 'update')
            matches.forEach((row) => {
              Object.assign(row, values);
            });
          if (descending)
            matches = [...matches].sort((a, b) =>
              String(b.created_at).localeCompare(String(a.created_at))
            );
          return Promise.resolve(
            resolve({
              data: single ? (matches[0] ?? null) : matches,
              error: null,
            })
          );
        },
      };
      return query;
    },
  };
}
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) =>
      handler(request, { user: { id: 'owner' }, supabase: client() }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => {
    state.adminCalls++;
    return client();
  },
}));

import { POST } from './route';

const chatId = '11111111-1111-4111-8111-111111111111';
const first = {
  id: '22222222-2222-4222-8222-222222222222',
  role: 'user',
  parts: [{ type: 'text', text: 'Show tasks' }],
};
const second = {
  id: '33333333-3333-4333-8333-333333333333',
  role: 'assistant',
  parts: [
    { type: 'text', text: 'Checking' },
    {
      type: 'dynamic-tool',
      toolName: 'search_tasks',
      toolCallId: 'call',
      state: 'output-available',
      input: {},
      output: { success: true },
    },
    { type: 'text', text: 'Here they are' },
  ],
};
const request = (messages = [first, second]) =>
  new NextRequest('https://example.test/api/ai/chat/live-messages', {
    method: 'POST',
    body: JSON.stringify({ chatId, messages }),
  });
beforeEach(() => {
  state.chats = [{ id: chatId, creator_id: 'owner' }];
  state.messages = [];
  state.adminCalls = 0;
});
it('persists ordered parts and stable message timestamps on retries', async () => {
  expect((await POST(request())).status).toBe(200);
  expect(state.messages).toHaveLength(2);
  const timestamps = state.messages.map((message) => message.created_at);
  expect(String(timestamps[0]) < String(timestamps[1])).toBe(true);
  expect(state.messages[1]?.metadata).toMatchObject({
    ai: { parts: second.parts },
  });
  expect((await POST(request())).status).toBe(200);
  expect(state.messages).toHaveLength(2);
  expect(state.messages.map((message) => message.created_at)).toEqual(
    timestamps
  );
});
it('rejects another owner before opening the admin client', async () => {
  state.chats[0]!.creator_id = 'someone-else';
  expect((await POST(request())).status).toBe(404);
  expect(state.adminCalls).toBe(0);
  expect(state.messages).toEqual([]);
});
it('does not overwrite a normal chat message or a message in another conversation', async () => {
  state.messages = [
    {
      id: first.id,
      chat_id: chatId,
      creator_id: 'owner',
      content: 'Original',
      metadata: {},
    },
  ];
  expect((await POST(request())).status).toBe(409);
  expect(state.messages[0]?.content).toBe('Original');
  state.messages[0]!.chat_id = 'another-chat';
  state.messages[0]!.metadata = { channel: 'live' };
  expect((await POST(request())).status).toBe(409);
});
it('creates a new owned conversation without generating a second AI reply', async () => {
  state.chats = [];
  expect((await POST(request([first]))).status).toBe(200);
  expect(state.chats[0]).toMatchObject({
    id: chatId,
    creator_id: 'owner',
    title: 'Show tasks',
  });
  expect(state.messages).toHaveLength(1);
});

it('retains complete long Unicode transcripts in canonical parts on save and retry', async () => {
  const text = '\u{1f30d}'.repeat(12000) + '日本語'.repeat(8000);
  const message = { ...first, parts: [{ type: 'text', text }] };
  for (let attempt = 0; attempt < 2; attempt++) {
    expect((await POST(request([message]))).status).toBe(200);
    expect(state.messages).toHaveLength(1);
    const saved = JSON.parse(JSON.stringify(state.messages[0]));
    expect(saved.metadata.ai.parts).toEqual(message.parts);
    expect(saved.metadata.ai.parts[0].text).toBe(text);
    expect(Array.from(saved.content)).toHaveLength(10000);
    expect(
      new TextEncoder().encode(saved.content).byteLength
    ).toBeLessThanOrEqual(40000);
  }
});

it('saves session notifications in canonical parts without losing their order', async () => {
  const notice = {
    ...second,
    parts: [
      {
        type: 'data-live-session',
        data: { status: 'ended', text: 'Session ended' },
      },
    ],
  };
  const response = await POST(
    new NextRequest('http://localhost/api/ai/chat/live-messages', {
      method: 'POST',
      body: JSON.stringify({ chatId, messages: [first, notice] }),
    })
  );
  expect(response.status).toBe(200);
  expect(
    (state.messages[1]!.metadata as { ai: { parts: unknown[] } }).ai.parts
  ).toEqual(notice.parts);
});
