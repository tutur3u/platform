import { describe, expect, it } from 'vitest';
import { ifNoneMatchMatches } from './http-cache';

describe('external-project HTTP cache validators', () => {
  it.each([
    'W/"revision-one"',
    '"revision-one"',
    '"other", W/"revision-one"',
    '*',
  ])('weak-matches If-None-Match value %s', (value) => {
    expect(ifNoneMatchMatches(value, 'W/"revision-one"')).toBe(true);
  });

  it('rejects unrelated validators', () => {
    expect(ifNoneMatchMatches('W/"other", "another"', 'W/"revision-one"')).toBe(
      false
    );
  });
});
