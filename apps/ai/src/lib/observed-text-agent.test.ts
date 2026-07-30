import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
