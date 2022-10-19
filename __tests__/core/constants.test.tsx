import {
  API_URL,
  AUTH_COOKIE_NAME,
  AUTH_URL,
  BASE_URL,
} from '../../src/core/constants';

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

describe('domains are not empty', () => {
  it('BASE_URL is not empty', () => {
    expect(BASE_URL).not.toEqual('');
  });

  it('AUTH_URL is not empty', () => {
    expect(AUTH_URL).not.toEqual('');
  });

  it('API_URL is not empty', () => {
    expect(API_URL).not.toEqual('');
  });

  // If any of these test cases are failing, make sure to change
  // the value of BASE_URL, AUTH_URL, or API_URL in src/core/constants.tsx
  // and all the places where it is used.
  it('BASE_URL is https://tuturuuu.com', () => {
    // Only check in production
    if (process.env.NODE_ENV === 'production')
      expect(BASE_URL).toEqual('https://tuturuuu.com');
  });

  it('AUTH_URL is https://auth.tuturuuu.com', () => {
    // Only check in production
    if (process.env.NODE_ENV === 'production')
      expect(AUTH_URL).toEqual('https://auth.tuturuuu.com');
  });

  it('API_URL is https://api.tuturuuu.com', () => {
    // Only check in production
    if (process.env.NODE_ENV === 'production')
      expect(API_URL).toEqual('https://api.tuturuuu.com');
  });
});
