import { describe, expect, it } from 'vitest';
import { resolveAppUrl } from '../app-url';

describe('resolveAppUrl', () => {
  it('uses the first valid configured URL', () => {
    expect(
      resolveAppUrl({
        candidates: ['development', 'https://learn.tuturuuu.com/'],
        fallback: 'http://localhost:7812',
      })
    ).toBe('https://learn.tuturuuu.com');
  });

  it('falls back when configured values are not absolute HTTP URLs', () => {
    expect(
      resolveAppUrl({
        candidates: ['development', '', 'ftp://learn.tuturuuu.com'],
        fallback: 'http://localhost:7812',
      })
    ).toBe('http://localhost:7812');
  });
});
