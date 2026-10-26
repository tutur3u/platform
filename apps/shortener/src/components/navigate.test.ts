import { describe, expect, it } from 'vitest';
import { leaveFor } from './navigate';

describe('leaveFor', () => {
  it('refuses script, malformed and non-string destinations', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,x',
      'vbscript:x',
      'not a url',
      undefined,
      42,
    ])
      expect(leaveFor(url)).toBe(false);
  });
});
