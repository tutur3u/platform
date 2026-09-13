import { InternalApiError } from '@tuturuuu/internal-api';
import { restoreAiConversation } from '@tuturuuu/internal-api/ai';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/internal-api/ai', () => ({
  restoreAiConversation: vi.fn(),
}));

import {
  loadExistingChat,
  restoreMessages,
} from './mira-chat-persistence-utils';

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

it('omits empty canonical records and preserves the legacy restoration path', () => {
  const restored = restoreMessages([
    {
      id: 'empty',
      role: 'ASSISTANT',
      content: null,
      metadata: { ai: { parts: [] } },
    },
    {
      id: 'legacy',
      role: 'ASSISTANT',
      content: 'Answer',
      metadata: {
        reasoning: 'Thought',
        toolCalls: [
          { toolName: 'lookup', toolCallId: 'one', args: { query: 'tasks' } },
        ],
        toolResults: [{ toolCallId: 'one', result: { count: 1 } }],
        sources: [
          { sourceId: 'source', url: 'https://example.com', title: 'Source' },
        ],
      },
    },
  ]);
  expect(restored).toHaveLength(1);
  expect(restored[0]?.parts).toEqual([
    { type: 'reasoning', text: 'Thought' },
    { type: 'text', text: 'Answer' },
    {
      type: 'dynamic-tool',
      toolName: 'lookup',
      toolCallId: 'one',
      input: { query: 'tasks' },
      output: { count: 1 },
      state: 'output-available',
    },
    {
      type: 'source-url',
      sourceId: 'source',
      url: 'https://example.com',
      title: 'Source',
    },
  ]);
});

it('restores concurrent timestamp ties deterministically', () => {
  const messages = ['b', 'a'].map((id) => ({
    id,
    role: 'USER',
    created_at: '2026-09-13T08:00:00.000000Z',
    content: id,
    metadata: null,
  }));
  expect(restoreMessages(messages).map((message) => message.id)).toEqual([
    'a',
    'b',
  ]);
});

it.each([401, 429, 500, 503])(
  'keeps restore failures retryable for status %s',
  async (status) => {
    const error = new InternalApiError('Restore failed', status);
    vi.mocked(restoreAiConversation).mockRejectedValueOnce(error);
    await expect(
      loadExistingChat({ wsId: 'workspace', storedChatId: 'chat' })
    ).rejects.toBe(error);
  }
);
it('clears only a missing conversation', async () => {
  vi.mocked(restoreAiConversation).mockRejectedValueOnce(
    new InternalApiError('Missing', 404)
  );
  await expect(
    loadExistingChat({ wsId: 'workspace', storedChatId: 'chat' })
  ).resolves.toBeNull();
});
