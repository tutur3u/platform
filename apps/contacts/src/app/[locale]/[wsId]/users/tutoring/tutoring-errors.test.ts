import { describe, expect, it } from 'vitest';
import { isTutoringContentRestricted } from './tutoring-errors';

// Same shape as `InternalApiError`: an Error carrying the API `code`.
function apiError(code?: string) {
  return Object.assign(new Error('nope'), { code, status: 403 });
}

describe('isTutoringContentRestricted', () => {
  it('recognizes the API restriction code', () => {
    expect(
      isTutoringContentRestricted(apiError('TUTORING_CONTENT_RESTRICTED'))
    ).toBe(true);
  });

  it.each([
    apiError(),
    apiError('OTHER'),
    new Error('plain'),
    'TUTORING_CONTENT_RESTRICTED',
    null,
  ])('ignores other failures: %j', (error) => {
    expect(isTutoringContentRestricted(error)).toBe(false);
  });
});
