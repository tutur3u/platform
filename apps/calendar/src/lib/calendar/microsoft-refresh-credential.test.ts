import { describe, expect, it } from 'vitest';
import { microsoftRefreshCredential } from './microsoft-refresh-credential';

const credential = {
  home_account_id: 'account',
  client_id: 'client',
  credential_type: 'RefreshToken',
  secret: 'test-refresh-credential',
};
const read = (entries: unknown) =>
  microsoftRefreshCredential(
    JSON.stringify({ RefreshToken: entries }),
    'account',
    'client'
  );

describe('Microsoft background credential persistence', () => {
  it('extracts only the account and client authenticated by this exchange', () => {
    expect(
      read({
        current: credential,
        other: { ...credential, home_account_id: 'other' },
      })
    ).toBe('test-refresh-credential');
  });
  it.each([
    { ...credential, home_account_id: 'other' },
    { ...credential, client_id: 'other' },
    { ...credential, credential_type: 'AccessToken' },
    { ...credential, secret: '' },
  ])('refuses mismatched or missing credentials', (entry) => {
    expect(read({ entry })).toBeNull();
  });
  it('refuses ambiguous credentials', () => {
    expect(read({ one: credential, two: credential })).toBeNull();
  });
  it.each(['{', 'null', '{}', '{"RefreshToken":[]}'])(
    'fails closed on malformed cache %s',
    (cache) => {
      expect(microsoftRefreshCredential(cache, 'account', 'client')).toBeNull();
    }
  );
  it('requires an authenticated account identity', () => {
    expect(
      microsoftRefreshCredential(
        JSON.stringify({ RefreshToken: { credential } }),
        undefined,
        'client'
      )
    ).toBeNull();
  });
});
