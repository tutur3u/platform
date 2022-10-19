import { AUTH_COOKIE_NAME } from '../../src/core/constants';

describe('auth cookie', () => {
  it('name is defined', () => {
    expect(AUTH_COOKIE_NAME).toBeDefined();
  });

  it('name is not empty', () => {
    expect(AUTH_COOKIE_NAME).not.toEqual('');
  });

  // If this test case is failing, make sure to change
  // the value of AUTH_COOKIE_NAME in src/core/constants.tsx
  // and all the places where it is used.
  it('name is tuturuuu-auth', () => {
    expect(AUTH_COOKIE_NAME).toEqual('tuturuuu-auth');
  });
});
