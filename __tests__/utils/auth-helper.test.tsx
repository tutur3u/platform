// auth-helper.test.tsx
import { AUTH_COOKIE_NAME } from '../../src/core/constants';

import { authenticated } from '../../src/utils/auth-helper';

describe('authenticated', () => {
  beforeAll(() => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: `${AUTH_COOKIE_NAME}=true`,
    });
  });

  it('returns true when there is a token', () => {
    expect(authenticated()).toBe(true);
  });
});

describe('unauthenticated', () => {
  beforeAll(() => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  });

  it('returns false when there is no token', () => {
    expect(authenticated()).toBe(false);
  });
});
