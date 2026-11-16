import type { LanguageModelUsage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCitationFix, reportedCitationUsage } from './provider';

const mocked = vi.hoisted(() => {
  const invalidObject: { kind: string; usage: LanguageModelUsage | undefined } =
    { kind: 'invalid-json', usage: undefined };
  return {
    generate: vi.fn(),
    google: vi.fn(),
    gateway: vi.fn(),
    invalidObject,
  };
});
vi.mock('server-only', () => ({}));
vi.mock('@ai-sdk/google', () => ({ google: mocked.google }));
vi.mock('ai', () => ({
  generateText: mocked.generate,
  gateway: mocked.gateway,
  Output: { json: () => ({ type: 'json' }) },
  NoObjectGeneratedError: {
    isInstance: (error: unknown) => error === mocked.invalidObject,
  },
}));
const usage: LanguageModelUsage = {
  inputTokens: 120,
  outputTokens: 90,
  totalTokens: 210,
  inputTokenDetails: {
    noCacheTokens: 120,
    cacheReadTokens: undefined,
    cacheWriteTokens: undefined,
  },
  outputTokenDetails: { textTokens: 80, reasoningTokens: 10 },
};
const input = () => ({
  input: 'Synthetic source material',
  modelId: 'google/gemini-2.5-flash',
  maxOutputTokens: 2048,
  signal: new AbortController().signal,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocked.invalidObject.usage = undefined;
  mocked.google.mockReturnValue({ provider: 'google' });
  mocked.gateway.mockReturnValue({ provider: 'gateway' });
  mocked.generate.mockResolvedValue({
    output: { title: 'Synthetic proposal' },
    totalUsage: usage,
  });
});

describe('one metered citation generation', () => {
  it('passes one bounded call with no automatic retry, tools, memory or telemetry recording', async () => {
    const request = input();
    const result = await generateCitationFix(request);
    expect(result.usage).toEqual({
      inputTokens: 120,
      outputTokens: 80,
      reasoningTokens: 10,
    });
    expect(mocked.generate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        maxRetries: 0,
        maxOutputTokens: 2048,
        reasoning: 'none',
        providerOptions: {
          google: {
            thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
          },
        },
        abortSignal: request.signal,
        telemetry: {
          isEnabled: false,
          recordInputs: false,
          recordOutputs: false,
        },
      })
    );
    const call = mocked.generate.mock.calls[0]?.[0];
    expect(call).not.toHaveProperty('tools');
    expect(mocked.google).toHaveBeenCalledExactlyOnceWith('gemini-2.5-flash');
  });

  it('settles reported usage even when JSON parsing fails', async () => {
    mocked.invalidObject.usage = usage;
    mocked.generate.mockRejectedValue(mocked.invalidObject);
    expect(await generateCitationFix(input())).toEqual({
      value: null,
      usage: { inputTokens: 120, outputTokens: 80, reasoningTokens: 10 },
    });
    expect(mocked.generate).toHaveBeenCalledTimes(1);
  });

  it('leaves missing input/output usage unknown instead of recording zero', () => {
    expect(() => reportedCitationUsage(undefined)).toThrow('BILLING_PENDING');
    expect(() =>
      reportedCitationUsage({ ...usage, inputTokens: undefined })
    ).toThrow('BILLING_PENDING');
    expect(() =>
      reportedCitationUsage({ ...usage, outputTokens: undefined })
    ).toThrow('BILLING_PENDING');
    expect(
      reportedCitationUsage({
        ...usage,
        outputTokenDetails: { textTokens: 90, reasoningTokens: undefined },
      }).reasoningTokens
    ).toBe(0);
  });

  it('returns ambiguous billing for provider failures without repeating a call', async () => {
    mocked.generate.mockRejectedValue(new Error('private provider response'));
    await expect(generateCitationFix(input())).rejects.toMatchObject({
      code: 'BILLING_PENDING',
      billingStatus: 'unknown',
    });
    expect(mocked.generate).toHaveBeenCalledTimes(1);
  });

  it('counts completion tokens once across text and reasoning billing buckets', () => {
    const normalized = reportedCitationUsage(usage);
    expect(normalized.outputTokens + normalized.reasoningTokens).toBe(90);
    expect(() => reportedCitationUsage({ ...usage, outputTokens: 9 })).toThrow(
      'BILLING_PENDING'
    );
  });

  it.each(['gemini-2.5-flash', 'google/gemini-2.5-flash-lite'])(
    'disables native Google thinking explicitly without changing the credit cap for %s',
    async (modelId) => {
      await generateCitationFix({ ...input(), modelId, maxOutputTokens: 173 });
      expect(mocked.generate).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          maxOutputTokens: 173,
          reasoning: 'none',
          providerOptions: {
            google: {
              thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
            },
          },
        })
      );
      expect(mocked.gateway).not.toHaveBeenCalled();
    }
  );

  it.each([
    'anthropic/claude-sonnet-4.6',
    'anthropic/claude-haiku-5.5',
    'anthropic/claude-opus-5',
  ])(
    'disables gateway thinking with a provider restriction for %s',
    async (modelId) => {
      await generateCitationFix({ ...input(), modelId, maxOutputTokens: 173 });
      expect(mocked.gateway).toHaveBeenCalledExactlyOnceWith(modelId);
      expect(mocked.google).not.toHaveBeenCalled();
      expect(mocked.generate).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          maxOutputTokens: 173,
          reasoning: 'none',
          providerOptions: {
            gateway: { only: ['anthropic'] },
            anthropic: { thinking: { type: 'disabled' }, effort: 'low' },
          },
        })
      );
    }
  );

  it.each(['google/gemini-3.1-flash-lite', 'gemini-3-flash-preview'])(
    'uses explicit minimum thinking inside the unchanged combined cap for %s',
    async (modelId) => {
      const result = await generateCitationFix({
        ...input(),
        modelId,
        maxOutputTokens: 173,
      });
      expect(mocked.generate).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          maxOutputTokens: 173,
          reasoning: 'minimal',
          providerOptions: {
            google: {
              thinkingConfig: {
                thinkingLevel: 'minimal',
                includeThoughts: false,
              },
            },
          },
        })
      );
      expect(result.usage.outputTokens + result.usage.reasoningTokens).toBe(90);
      expect(mocked.gateway).not.toHaveBeenCalled();
    }
  );

  it('uses the supported low thinking level for Gemini3Pro without adding tokens to the admitted cap', async () => {
    await generateCitationFix({
      ...input(),
      modelId: 'google/gemini-3.1-pro-preview',
      maxOutputTokens: 173,
    });
    expect(mocked.generate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        maxOutputTokens: 173,
        reasoning: 'low',
        providerOptions: {
          google: {
            thinkingConfig: { thinkingLevel: 'low', includeThoughts: false },
          },
        },
      })
    );
  });

  it.each(['openai/gpt-6-sol', 'openai/gpt-6-luna'])(
    'sets explicit supported none effort for gateway model %s',
    async (modelId) => {
      await generateCitationFix({ ...input(), modelId, maxOutputTokens: 173 });
      expect(mocked.gateway).toHaveBeenCalledExactlyOnceWith(modelId);
      expect(mocked.generate).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          maxOutputTokens: 173,
          reasoning: 'none',
          providerOptions: {
            gateway: { only: ['openai'] },
            openai: { reasoningEffort: 'none', reasoningSummary: null },
          },
        })
      );
    }
  );

  it.each([
    'google/gemini-2.5-pro',
    'google/gemini-unknown-flash',
    'anthropic/claude-opus-5.5',
    'anthropic/claude-sonnet-5.5',
    'anthropic/claude-fable-5',
    'openai/gpt-6-astra',
    'openai/o3',
    'deepseek/deepseek-r1',
    'google/synthetic-model',
  ])(
    'refuses unbounded or unsupported reasoning for %s before any provider call',
    async (modelId) => {
      await expect(
        generateCitationFix({ ...input(), modelId })
      ).rejects.toMatchObject({
        code: 'AI_UNAVAILABLE',
        status: 503,
        billingStatus: undefined,
      });
      expect(mocked.generate).not.toHaveBeenCalled();
      expect(mocked.google).not.toHaveBeenCalled();
      expect(mocked.gateway).not.toHaveBeenCalled();
    }
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses invalid credit-derived caps before any provider call',
    async (maxOutputTokens) => {
      await expect(
        generateCitationFix({ ...input(), maxOutputTokens })
      ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
      expect(mocked.generate).not.toHaveBeenCalled();
    }
  );
});
