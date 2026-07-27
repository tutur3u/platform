import { describe, expect, it } from 'vitest';
import {
  AUTH_OAUTH_PROVIDER_OPTIONS,
  AUTH_OAUTH_PROVIDERS,
} from './oauth-providers';

describe('auth OAuth providers', () => {
  it('exposes Microsoft Azure for account login and linking', () => {
    expect(AUTH_OAUTH_PROVIDERS).toEqual([
      'apple',
      'google',
      'azure',
      'github',
    ]);
  });

  // The email scope is what makes Azure usable for account matching at all, and
  // it is also the whole risk: on the shared `common` issuer the claim is not a
  // mailbox we verified. Asserted here so the pairing stays a deliberate choice.
  it('requests the email scope for Microsoft', () => {
    expect(AUTH_OAUTH_PROVIDER_OPTIONS.azure).toEqual({
      name: 'Microsoft',
      scopes: 'email',
    });
  });

  it('keeps an options entry for every advertised provider', () => {
    expect(Object.keys(AUTH_OAUTH_PROVIDER_OPTIONS).sort()).toEqual(
      [...AUTH_OAUTH_PROVIDERS].sort()
    );
  });
});
