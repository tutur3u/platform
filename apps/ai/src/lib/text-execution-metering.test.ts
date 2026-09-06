import { NoObjectGeneratedError } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  summaries: vi.fn(),
  prepare: vi.fn(),
  settle: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('./observed-text-agent', () => ({
  createObservedTextAgent: () => ({
    agent: { generate: mocks.generate },
    summaries: mocks.summaries,
  }),
}));
vi.mock('./public-api', () => ({
  approximateTokenCount: () => 1,
  captureAiStudioContent: mocks.capture,
  describeAiStudioRuntimeError: () => ({ errorType: 'Error' }),
  prepareMeteredExecution: mocks.prepare,
  settleMeteredExecution: mocks.settle,
  publicApiError: () =>
    Response.json({ error: 'generation_failed' }, { status: 502 }),
}));

import { executeTextRequest, parseTextRequest } from './text-execution';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prepare.mockResolvedValue({ requestId: 'request-id', runId: 'run-id' });
  mocks.settle.mockResolvedValue(undefined);
  mocks.summaries.mockReturnValue([]);
  mocks.capture.mockResolvedValue(undefined);
});
const input = () =>
  parseTextRequest({ model: 'google/gemini-3.5-flash-lite', prompt: 'Test' });

describe('AI execution usage settlement', () => {
  it('records charged tokens even when generated JSON cannot be parsed', async () => {
    mocks.generate.mockRejectedValue(
      new NoObjectGeneratedError({
        message: 'Invalid JSON',
        text: '{',
        finishReason: 'length',
        response: {
          id: 'provider-id',
          modelId: 'model',
          timestamp: new Date(),
        },
        usage: {
          inputTokens: 123,
          outputTokens: 64,
          outputTokenDetails: { reasoningTokens: 8 },
        } as never,
      })
    );
    const response = await executeTextRequest(
      new Request('https://test/v1/chat/completions'),
      input(),
      { feature: 'chat_completions', responseShape: 'chat' }
    );
    expect(response.status).toBe(502);
    expect(mocks.settle).toHaveBeenCalledTimes(1);
    expect(mocks.settle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'failed',
        usage: { inputTokens: 123, outputTokens: 64, reasoningTokens: 8 },
        metadata: { usage_source: 'provider', finish_reason: 'length' },
      })
    );
  });
  it('does not overwrite settled usage when optional content capture fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.generate.mockResolvedValue({
      text: 'ok',
      finishReason: 'stop',
      steps: [{}],
      toolCalls: [],
      usage: { inputTokens: 10, outputTokens: 2 },
    });
    mocks.capture.mockRejectedValue(new Error('capture unavailable'));
    const response = await executeTextRequest(
      new Request('https://test/v1/chat/completions', {
        headers: {
          'x-tuturuuu-operation': 'scan-analysis',
          'x-tuturuuu-entity-id': 'scan-123',
        },
      }),
      input(),
      { feature: 'chat_completions', responseShape: 'chat' }
    );
    expect(response.status).toBe(200);
    expect(mocks.settle).toHaveBeenCalledTimes(1);
    expect(mocks.settle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'succeeded',
        usage: { inputTokens: 10, outputTokens: 2, reasoningTokens: 0 },
      })
    );
    expect(mocks.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'scan-analysis',
        metadata: expect.objectContaining({
          operation: 'scan-analysis',
          entity_id: 'scan-123',
        }),
      })
    );
    log.mockRestore();
  });
  it('retains completed model-step usage if a later step fails without usage', async () => {
    mocks.summaries.mockReturnValue([
      { type: 'model', inputTokens: 200, outputTokens: 30, reasoningTokens: 5 },
      {
        type: 'tool',
        inputTokens: 999,
        outputTokens: 999,
        reasoningTokens: 999,
      },
    ]);
    mocks.generate.mockRejectedValue(new Error('later provider call failed'));
    await executeTextRequest(
      new Request('https://test/v1/chat/completions'),
      input(),
      { feature: 'chat_completions', responseShape: 'chat' }
    );
    expect(mocks.settle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        usage: { inputTokens: 200, outputTokens: 30, reasoningTokens: 5 },
        metadata: { usage_source: 'provider_partial' },
      })
    );
  });
  it('labels unavailable usage explicitly instead of claiming measured zero usage', async () => {
    mocks.generate.mockRejectedValue(new Error('provider unreachable'));
    await executeTextRequest(
      new Request('https://test/v1/chat/completions'),
      input(),
      { feature: 'chat_completions', responseShape: 'chat' }
    );
    expect(mocks.settle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'failed',
        metadata: { usage_source: 'unavailable' },
      })
    );
  });
});
