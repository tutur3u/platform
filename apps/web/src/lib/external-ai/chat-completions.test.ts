import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  beginRun: vi.fn(),
  calculateCost: vi.fn(),
  generateText: vi.fn(),
  google: vi.fn(),
  settleRun: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  google: mocks.google,
}));
vi.mock('@tuturuuu/ai/studio/metering', () => ({
  beginExternalAiStudioRun: mocks.beginRun,
  calculateAiStudioUsageCost: mocks.calculateCost,
  settleExternalAiStudioRun: mocks.settleRun,
}));
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: mocks.generateText,
    streamText: mocks.streamText,
  };
});
vi.mock('./auth', () => ({
  authenticateExternalAiRequest: mocks.authenticate,
}));

import { executeExternalChatCompletion } from './chat-completions';

const workspaceId = '449cdd3b-121b-40f7-9cee-28f5b582e204';

function request(body: Record<string, unknown>) {
  return new Request(
    'https://tuturuuu.com/api/v1/external-ai/chat/completions',
    {
      body: JSON.stringify(body),
      headers: {
        authorization: 'Bearer ttr_app_test',
        'content-type': 'application/json',
        'x-request-id': 'request-1',
        'x-tuturuuu-workspace-id': workspaceId,
      },
      method: 'POST',
    }
  );
}

describe('executeExternalChatCompletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({
      actorId: 'user-1',
      appId: 'cybershield35',
      scopes: ['workspace:session', 'ai:use'],
      workspaceId,
    });
    mocks.beginRun.mockResolvedValue({ runId: 'run-1' });
    mocks.calculateCost.mockResolvedValue({
      billedCredits: 9,
      providerCostUsd: 0.001,
    });
    mocks.google.mockReturnValue('google-model');
    mocks.settleRun.mockResolvedValue(undefined);
  });

  it('uses the centrally configured Google provider and returns structured output', async () => {
    mocks.generateText.mockResolvedValue({
      finishReason: 'stop',
      output: { blocks: [{ text: 'Bản nháp tự nhiên', type: 'text' }] },
      text: '',
      usage: {
        inputTokens: 14,
        outputTokenDetails: { reasoningTokens: 2 },
        outputTokens: 8,
      },
    });

    const response = await executeExternalChatCompletion(
      request({
        messages: [
          { content: 'Viết tiếng Việt tự nhiên.', role: 'system' },
          { content: 'Soạn bản nháp phản bác.', role: 'user' },
        ],
        model: 'google/gemini-3.5-flash-lite',
        response_format: {
          json_schema: {
            name: 'article',
            schema: {
              additionalProperties: false,
              properties: { blocks: { type: 'array' } },
              required: ['blocks'],
              type: 'object',
            },
            strict: true,
          },
          type: 'json_schema',
        },
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(JSON.parse(body.choices[0].message.content)).toEqual({
      blocks: [{ text: 'Bản nháp tự nhiên', type: 'text' }],
    });
    expect(mocks.google).toHaveBeenCalledWith('gemini-3.5-flash-lite');
    expect(mocks.beginRun).toHaveBeenCalledWith(
      expect.objectContaining({
        externalAppId: 'cybershield35',
        modelId: 'google/gemini-3.5-flash-lite',
        workspaceId,
      })
    );
    expect(mocks.settleRun).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 14,
        outputTokens: 8,
        providerCostUsd: 0.001,
        runId: 'run-1',
        status: 'succeeded',
      })
    );
  });

  it('streams OpenAI-compatible chunks and settles the external run', async () => {
    mocks.streamText.mockReturnValue({
      textStream: {
        async *[Symbol.asyncIterator]() {
          yield 'Xin ';
          yield 'chào';
        },
      },
      usage: Promise.resolve({
        inputTokens: 4,
        outputTokenDetails: { reasoningTokens: 0 },
        outputTokens: 2,
      }),
    });

    const response = await executeExternalChatCompletion(
      request({
        messages: [{ content: 'Chào bằng tiếng Việt.', role: 'user' }],
        model: 'google/gemini-3.5-flash-lite',
        stream: true,
      })
    );
    const body = await response.text();

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(body).toContain('"content":"Xin "');
    expect(body).toContain('"content":"chào"');
    expect(body).toContain('data: [DONE]');
    expect(mocks.settleRun).toHaveBeenCalledWith(
      expect.objectContaining({
        outputTokens: 2,
        runId: 'run-1',
        status: 'succeeded',
      })
    );
  });

  it('does not execute a provider call for a non-Google model', async () => {
    const response = await executeExternalChatCompletion(
      request({
        messages: [{ content: 'Hello', role: 'user' }],
        model: 'openai/gpt-5',
      })
    );

    expect(response.status).toBe(404);
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.settleRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', status: 'failed' })
    );
  });
});
