import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { captureAgentSettings, googleMock } = vi.hoisted(() => ({
  captureAgentSettings: vi.fn(),
  googleMock: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  google: googleMock,
}));

vi.mock('ai', () => ({
  isStepCount: (maxSteps: number) => ({ maxSteps }),
  ToolLoopAgent: class {
    constructor(settings: unknown) {
      captureAgentSettings(settings);
    }
  },
}));

vi.mock('@/lib/playground-tools', () => ({
  resolvePlaygroundTools: () => ({}),
}));

vi.mock('@/lib/public-api', () => ({
  recordMeteredExecutionStep: vi.fn(),
}));

import { createObservedTextAgent } from './observed-text-agent';

describe('createObservedTextAgent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    captureAgentSettings.mockReset();
    googleMock.mockReset();
  });

  it('uses the direct Google provider with the bare catalog model ID', () => {
    const directGoogleModel = { provider: 'google' };
    googleMock.mockReturnValue(directGoogleModel);

    createObservedTextAgent({
      context: {} as never,
      instructions: 'Answer briefly.',
      maxOutputTokens: 64,
      maxSteps: 2,
      modelId: 'google/gemini-3.1-flash-lite',
      signal: new AbortController().signal,
      toolNames: [],
    });

    expect(googleMock).toHaveBeenCalledWith('gemini-3.1-flash-lite');
    expect(captureAgentSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        model: directGoogleModel,
      })
    );
  });

  it('keeps an already bare Google model ID unchanged', () => {
    createObservedTextAgent({
      context: {} as never,
      maxOutputTokens: 64,
      maxSteps: 1,
      modelId: 'gemini-3.1-flash-lite',
      signal: new AbortController().signal,
      toolNames: [],
    });

    expect(googleMock).toHaveBeenCalledWith('gemini-3.1-flash-lite');
  });

  it('returns bounded, redacted tool details for the ephemeral trace', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const observed = createObservedTextAgent({
      context: {} as never,
      maxOutputTokens: 64,
      maxSteps: 2,
      modelId: 'google/gemini-3.1-flash-lite',
      signal: new AbortController().signal,
      toolNames: ['calculator'],
    });
    const settings = captureAgentSettings.mock.calls[0]?.[0] as {
      onToolExecutionEnd: (event: {
        callId: string;
        toolCall: {
          input: unknown;
          toolCallId: string;
          toolName: string;
        };
        toolExecutionMs: number;
        toolOutput: { output: unknown; type: 'tool-result' };
      }) => Promise<void>;
      onToolExecutionStart: (event: {
        toolCall: { toolCallId: string };
      }) => void;
    };

    settings.onToolExecutionStart({
      toolCall: { toolCallId: 'tool-1' },
    });
    await settings.onToolExecutionEnd({
      callId: 'call-1',
      toolCall: {
        input: { apiKey: 'must-not-leak', left: 128, right: 37 },
        toolCallId: 'tool-1',
        toolName: 'calculator',
      },
      toolExecutionMs: 0.176747,
      toolOutput: {
        output: { secret: 'must-not-leak', value: 4736 },
        type: 'tool-result',
      },
    });

    expect(observed.summaries()).toEqual([
      expect.objectContaining({
        callId: 'call-1',
        inputJson: '{"apiKey":"[REDACTED]","left":128,"right":37}',
        latencyMs: 0.176747,
        name: 'calculator',
        outputJson: '{"secret":"[REDACTED]","value":4736}',
        status: 'succeeded',
        toolCallId: 'tool-1',
        type: 'tool',
      }),
    ]);
  });
});
