import { describe, expect, it } from 'vitest';
import { measureMeetUsage } from './usage';

describe('Meet Gemini usage', () => {
  it('prices audio and text separately and includes thinking in output', () => {
    const result = measureMeetUsage({
      promptTokenCount: 1100,
      candidatesTokenCount: 200,
      thoughtsTokenCount: 100,
      promptTokensDetails: [
        { modality: 'AUDIO', tokenCount: 1000 },
        { modality: 'TEXT', tokenCount: 100 },
      ],
    });
    expect(result.costUsd).toBeCloseTo(0.000975, 10);
    expect(result.usage.outputTokens).toBe(300);
  });
  it('can price text-only notes when modality details are omitted', () => {
    expect(
      measureMeetUsage(
        { promptTokenCount: 1000, candidatesTokenCount: 100 },
        'text'
      ).costUsd
    ).toBeCloseTo(0.0004);
  });
  it('does not silently price audio as text when modality details are missing', () => {
    expect(
      measureMeetUsage({ promptTokenCount: 1000, candidatesTokenCount: 100 })
        .costUsd
    ).toBeNull();
  });
  it.each(
    [
      [],
      [null],
      [{ modality: 'AUDIO', tokenCount: 1100 }],
      [{ modality: 'AUDIO', tokenCount: 900 }],
      [{ modality: 'AUDIO', tokenCount: -1 }],
      [{ modality: 'TEXT', tokenCount: 1000 }],
    ].map((details) => ({ details }))
  )(
    'leaves incomplete or malformed audio accounting unpriced: %j',
    ({ details }) => {
      expect(
        measureMeetUsage({
          promptTokenCount: 1000,
          candidatesTokenCount: 100,
          promptTokensDetails: details,
        }).costUsd
      ).toBeNull();
    }
  );
  it.each([
    null,
    {},
    { promptTokenCount: -1, candidatesTokenCount: 3 },
    { promptTokenCount: NaN, candidatesTokenCount: 1 },
  ])('marks unavailable usage as unknown, not free', (metadata) => {
    expect(measureMeetUsage(metadata).costUsd).toBeNull();
  });
});
