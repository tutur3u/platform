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
});
