import { describe, expect, it } from 'vitest';
import {
  AI_STUDIO_MAX_RANGE_MS,
  numberValue,
  parseAiStudioDateRange,
} from './observability';

describe('AI Studio observability range', () => {
  it('accepts a bounded explicit range', () => {
    const url = new URL(
      'https://ai.example/usage?from=2026-07-01T00:00:00.000Z&to=2026-07-28T00:00:00.000Z'
    );
    expect(parseAiStudioDateRange(url)).toEqual({
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-28T00:00:00.000Z'),
    });
  });

  it('rejects inverted and overlong ranges', () => {
    expect(
      parseAiStudioDateRange(
        new URL('https://ai.example/usage?from=2026-07-02&to=2026-07-01')
      )
    ).toBeNull();
    const from = new Date(0);
    const to = new Date(AI_STUDIO_MAX_RANGE_MS + 1);
    expect(
      parseAiStudioDateRange(
        new URL(
          `https://ai.example/usage?from=${from.toISOString()}&to=${to.toISOString()}`
        )
      )
    ).toBeNull();
  });

  it('normalizes numeric database values', () => {
    expect(numberValue('12.5')).toBe(12.5);
    expect(numberValue(null)).toBe(0);
  });
});
