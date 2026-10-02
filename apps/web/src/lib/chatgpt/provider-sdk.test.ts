// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveChatGPTModel } from './provider';
import { withChatGPTStore } from './storage';

let directory: string;
const userId = '11111111-1111-4111-8111-111111111111';
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'chatgpt-sdk-test-'));
  vi.stubEnv('CHATGPT_SUBSCRIPTIONS_DIR', directory);
  vi.stubEnv('TUTURUUU_DEPLOYMENT_MODE', 'self-hosted');
  vi.stubEnv('OPENAI_CHATGPT_ENABLED', 'true');
  await withChatGPTStore(userId, async (store) => {
    store.registrations.push({
      clientId: 'oaiapp_synthetic',
      subject: 'synthetic-subject',
      accessToken: 'synthetic-access',
      refreshToken: 'synthetic-refresh',
      scopes: ['chatgpt.tokens.use.direct'],
      expiresAt: Date.now() + 3_600_000,
    });
  });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe('real OpenAI SDK adapter with a mocked upstream', () => {
  it.each(['completed', 'failed', 'interrupted', 'incomplete'])(
    'handles %s inference through the installed SDK',
    async (terminal) => {
      const events: unknown[] = [
        {
          type: 'response.created',
          response: {
            id: 'synthetic-response',
            created_at: 1,
            model: 'synthetic-model',
          },
        },
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: { type: 'message', id: 'synthetic-message' },
        },
        {
          type: 'response.output_text.delta',
          item_id: 'synthetic-message',
          delta: 'Hello',
        },
      ];
      if (terminal !== 'interrupted')
        events.push(
          terminal === 'failed'
            ? {
                type: 'response.failed',
                sequence_number: 3,
                response: {
                  error: {
                    code: 'subscription_sharing_usage_limit_exceeded',
                    message: 'Synthetic limit',
                  },
                },
              }
            : { type: `response.${terminal}`, response: {} }
        );
      const fetchMock = vi.fn().mockImplementation(async (url) => {
        if (url === 'https://api.openai.com/v1/models')
          return Response.json({
            models: [
              {
                slug: 'synthetic-model',
                display_name: 'Synthetic model',
                visibility: 'list',
              },
            ],
          });
        return new Response(
          events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
          { headers: { 'Content-Type': 'text/event-stream' } }
        );
      });
      vi.stubGlobal('fetch', fetchMock);
      const model = await resolveChatGPTModel(
        userId,
        'chatgpt/oaiapp_synthetic/synthetic-model'
      );
      const result = await model.doStream({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
        maxOutputTokens: 100,
        temperature: 1,
      });
      const parts = [];
      const reader = result.stream.getReader();
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        parts.push(next.value);
      }
      expect(parts.some((part) => part.type === 'error')).toBe(
        terminal !== 'completed'
      );
      const finish = parts.find((part) => part.type === 'finish');
      if (terminal === 'completed')
        expect(finish).toMatchObject({ finishReason: { unified: 'stop' } });
      else
        expect(finish).not.toMatchObject({ finishReason: { unified: 'stop' } });
      const sent = JSON.parse(fetchMock.mock.calls[1]?.[1].body);
      expect(sent).toMatchObject({ store: false, stream: true });
      expect(sent).not.toHaveProperty('max_output_tokens');
      expect(sent).not.toHaveProperty('temperature');
    }
  );
});
