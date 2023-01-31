import { API_URL, AUTH_URL, BASE_URL } from '../../src/constants/common';

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
