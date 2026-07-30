import { describe, expect, it } from 'vitest';
import {
  formatTraceDuration,
  formatTraceJson,
  summarizePlaygroundTrace,
} from './playground-trace';

describe('playground trace helpers', () => {
  it('formats noisy AI SDK timing values for scanning', () => {
    expect(formatTraceDuration(0.176747)).toBe('0.18 ms');
    expect(formatTraceDuration(28.013273)).toBe('28 ms');
    expect(formatTraceDuration(1126.422926)).toBe('1.13 s');
    expect(formatTraceDuration(null)).toBe('—');
  });

  it('pretty prints structured tool details and preserves truncated values', () => {
    expect(formatTraceJson('{"left":128,"right":37}')).toBe(
      '{\n  "left": 128,\n  "right": 37\n}'
    );
    expect(formatTraceJson('{"truncated":true…')).toBe('{"truncated":true…');
  });

  it('summarizes step types and the wall-clock trace span', () => {
    const base = {
      cachedInputTokens: 0,
      callId: null,
      effectiveOutputTokensPerSecond: null,
      finishReason: null,
      inputJson: null,
      inputTokens: 0,
      latencyMs: 100,
      modelId: null,
      outputJson: null,
      outputTokens: 0,
      provider: null,
      reasoningTokens: 0,
      responseId: null,
      responseTimeMs: null,
      status: 'succeeded' as const,
      timeToFirstOutputMs: null,
      toolCallCount: 0,
      toolCallId: null,
      toolResultCount: 0,
    };
    const summary = summarizePlaygroundTrace([
      {
        ...base,
        completedAt: '2026-07-30T16:00:01.000Z',
        name: 'gemini',
        sequence: 0,
        startedAt: '2026-07-30T16:00:00.000Z',
        type: 'model',
      },
      {
        ...base,
        completedAt: '2026-07-30T16:00:01.250Z',
        name: 'calculator',
        sequence: 1,
        startedAt: '2026-07-30T16:00:01.000Z',
        type: 'tool',
      },
    ]);

    expect(summary).toEqual({
      durationMs: 1250,
      modelSteps: 1,
      toolSteps: 1,
    });
  });
});
