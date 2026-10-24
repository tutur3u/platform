import { describe, expect, it } from 'vitest';
import { parseReserves } from '../src/reserves';

describe('reserve configuration', () => {
  it('accepts supported reserve fields', () => {
    expect(
      parseReserves(
        '{"claude_dd":{"minRemainingPercent":25,"maxConcurrent":2,"excluded":false}}'
      )
    ).toEqual({
      claude_dd: {
        minRemainingPercent: 25,
        maxConcurrent: 2,
        excluded: false,
      },
    });
  });

  it.each([
    'null',
    '[]',
    '{"claude_dd":null}',
    '{"claude_dd":{"minRemainingPercent":"low"}}',
    '{"claude_dd":{"minRemainingPercent":-1}}',
    '{"claude_dd":{"minRemainingPercent":101}}',
    '{"claude_dd":{"maxConcurrent":-1}}',
    '{"claude_dd":{"maxConcurrent":1.5}}',
    '{"claude_dd":{"excluded":"false"}}',
  ])('rejects invalid reserve configuration %s', (value) => {
    expect(() => parseReserves(value)).toThrow(
      'AGENT_QUOTA_RESERVES must contain valid JSON.'
    );
  });
});
