import { createAnthropic } from '@ai-sdk/anthropic';
import { createGateway } from '@ai-sdk/gateway';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { describe, expect, it } from 'vitest';
import { normalizeAiTokenUsage, toLegacyTokenPricing } from './token-usage';

// Each case sends a recorded-shape provider payload through the provider's own
// usage conversion and the AI SDK, then checks what the billing boundary sees.
const INPUT = 10;
const TEXT = 20;
const REASONING = 30;
const OUTPUT_TOTAL = TEXT + REASONING;

function jsonFetch(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })) as unknown as typeof fetch;
}

function expectBilledOnce(
  usage: Awaited<ReturnType<typeof generateText>>['usage'],
  reasoning: number
) {
  expect(usage.outputTokens).toBe(OUTPUT_TOTAL);
  expect(normalizeAiTokenUsage(usage)).toEqual({
    inputTokens: INPUT,
    outputTokens: OUTPUT_TOTAL,
    reasoningTokens: reasoning,
  });
  const pricing = toLegacyTokenPricing(usage);
  expect(pricing).toEqual({
    inputTokens: INPUT,
    outputTokens: OUTPUT_TOTAL - reasoning,
    reasoningTokens: reasoning,
  });
  expect(pricing.outputTokens + pricing.reasoningTokens).toBe(OUTPUT_TOTAL);
}

describe('provider usage reaches billing with reasoning counted once', () => {
  it('Gemini direct: candidates exclude thoughts and the provider adds them to the total', async () => {
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-key',
      fetch: jsonFetch({
        candidates: [
          {
            content: { parts: [{ text: 'ok' }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          },
        ],
        usageMetadata: {
          candidatesTokenCount: TEXT,
          promptTokenCount: INPUT,
          thoughtsTokenCount: REASONING,
          totalTokenCount: INPUT + OUTPUT_TOTAL,
        },
      }),
    });

    const result = await generateText({
      model: provider('gemini-2.5-flash'),
      prompt: 'hello',
    });

    expectBilledOnce(result.usage, REASONING);
  });

  it('OpenAI chat: completion tokens already include reasoning', async () => {
    const provider = createOpenAI({
      apiKey: 'test-key',
      fetch: jsonFetch({
        choices: [
          {
            finish_reason: 'stop',
            index: 0,
            message: { content: 'ok', role: 'assistant' },
          },
        ],
        created: 1,
        id: 'chatcmpl-test',
        model: 'gpt-5',
        object: 'chat.completion',
        usage: {
          completion_tokens: OUTPUT_TOTAL,
          completion_tokens_details: { reasoning_tokens: REASONING },
          prompt_tokens: INPUT,
          total_tokens: INPUT + OUTPUT_TOTAL,
        },
      }),
    });

    const result = await generateText({
      model: provider.chat('gpt-5'),
      prompt: 'hello',
    });

    expectBilledOnce(result.usage, REASONING);
  });

  it('Anthropic: output tokens include thinking when it is reported', async () => {
    const provider = createAnthropic({
      apiKey: 'test-key',
      fetch: jsonFetch({
        content: [{ text: 'ok', type: 'text' }],
        id: 'msg_test',
        model: 'claude-sonnet-4-5',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: INPUT,
          output_tokens: OUTPUT_TOTAL,
          output_tokens_details: { thinking_tokens: REASONING },
        },
      }),
    });

    const result = await generateText({
      model: provider('claude-sonnet-4-5'),
      prompt: 'hello',
    });

    expectBilledOnce(result.usage, REASONING);
  });

  it('Anthropic without a thinking breakdown subtracts nothing', async () => {
    const provider = createAnthropic({
      apiKey: 'test-key',
      fetch: jsonFetch({
        content: [{ text: 'ok', type: 'text' }],
        id: 'msg_test',
        model: 'claude-sonnet-4-5',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: { input_tokens: INPUT, output_tokens: OUTPUT_TOTAL },
      }),
    });

    const result = await generateText({
      model: provider('claude-sonnet-4-5'),
      prompt: 'hello',
    });

    expectBilledOnce(result.usage, 0);
  });

  it('AI Gateway: forwards the upstream usage without conversion', async () => {
    const provider = createGateway({
      apiKey: 'test-key',
      baseURL: 'https://gateway.test/v3/ai',
      fetch: jsonFetch({
        content: [{ text: 'ok', type: 'text' }],
        finishReason: { raw: 'stop', unified: 'stop' },
        usage: {
          inputTokens: {
            cacheRead: 0,
            cacheWrite: 0,
            noCache: INPUT,
            total: INPUT,
          },
          outputTokens: {
            reasoning: REASONING,
            text: TEXT,
            total: OUTPUT_TOTAL,
          },
        },
        warnings: [],
      }),
    });

    const result = await generateText({
      model: provider('google/gemini-2.5-flash'),
      prompt: 'hello',
    });

    expectBilledOnce(result.usage, REASONING);
  });
});
