import { describe, expect, it } from 'vitest';
import { rankOperatorRows } from '../src/operator-cli';

describe('operator dry-run ranking', () => {
  it('prefers configured weight over an opposing UNKNOWN ordering hint', () => {
    const ranked = rankOperatorRows([
      {
        pool: 'preferred',
        exitCode: 0,
        state: 'UNKNOWN',
        preference: 5,
        unknownOrderHint: 20,
      },
      {
        pool: 'more-remaining',
        exitCode: 0,
        state: 'UNKNOWN',
        preference: 1,
        unknownOrderHint: 80,
      },
    ]);

    expect(ranked.map((row) => row.pool)).toEqual([
      'preferred',
      'more-remaining',
    ]);
  });
});
