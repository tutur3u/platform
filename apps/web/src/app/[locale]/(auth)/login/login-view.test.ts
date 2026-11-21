import { describe, expect, it } from 'vitest';
import {
  canAutoStartProvider,
  readProviderHint,
  shouldOfferSavedAccountChooser,
} from './login-view';

const account = {
  email: null,
  id: 'a',
  metadata: {
    addedAt: null,
    avatarUrl: null,
    displayName: null,
    lastActiveAt: null,
    lastRoute: null,
    lastWorkspaceId: null,
  },
};

const base = {
  dismissed: false,
  hasCrossAppReturn: false,
  hasSession: false,
  multiAccount: false,
  providerHint: 'google' as const,
  savedAccounts: [account],
};

describe('readProviderHint', () => {
  it('accepts only providers the page may start automatically', () => {
    expect(readProviderHint('google')).toBe('google');
    expect(readProviderHint('azure')).toBeNull();
    expect(readProviderHint('evil')).toBeNull();
    expect(readProviderHint(null)).toBeNull();
  });
});

describe('shouldOfferSavedAccountChooser', () => {
  it('offers saved accounts for a provider hint or a cross-app return', () => {
    expect(shouldOfferSavedAccountChooser(base)).toBe(true);
    expect(
      shouldOfferSavedAccountChooser({
        ...base,
        hasCrossAppReturn: true,
        providerHint: null,
      })
    ).toBe(true);
  });

  it.each([
    ['a session already exists', { hasSession: true }],
    ['the user asked for another account', { dismissed: true }],
    ['the device has no saved accounts', { savedAccounts: [] }],
    ['the request adds an account', { multiAccount: true }],
    ['nothing would leave the page', { providerHint: null }],
  ])('stays hidden when %s', (_name, overrides) => {
    expect(shouldOfferSavedAccountChooser({ ...base, ...overrides })).toBe(
      false
    );
  });
});

describe('canAutoStartProvider', () => {
  const auto = {
    hasSession: false,
    multiAccount: false,
    providerHint: 'google' as const,
    savedAccounts: [],
  };

  it('starts the hint only on a device known to have no session or saved account', () => {
    expect(canAutoStartProvider(auto)).toBe(true);
  });

  it.each([
    ['the saved accounts are unknown', { savedAccounts: null }],
    ['the device has saved accounts', { savedAccounts: [account] }],
    ['a session exists', { hasSession: true }],
    ['the request adds an account', { multiAccount: true }],
    ['there is no hint', { providerHint: null }],
  ])('waits for a click when %s', (_name, overrides) => {
    expect(canAutoStartProvider({ ...auto, ...overrides })).toBe(false);
  });
});
