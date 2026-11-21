import { describe, expect, it } from 'vitest';
import {
  canAutoStartProvider,
  getAnotherAccountRequestKey,
  isFocusedExternalSignIn,
  mayBeFocusedExternalSignIn,
  readProviderHint,
  resolveFocusedSignInStep,
  shouldOfferSavedAccountChooser,
  shouldResolveLoginView,
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
const edufest = 'https://showcase.ieeai.net/edufest/verify-token?state=s';

describe('readProviderHint', () => {
  it('accepts only providers the page may start automatically', () => {
    expect(readProviderHint('google')).toBe('google');
    expect(readProviderHint('azure')).toBeNull();
    expect(readProviderHint('evil')).toBeNull();
    expect(readProviderHint(null)).toBeNull();
  });
});

describe('shouldResolveLoginView', () => {
  it('fetches the private view only when it can change what the page does', () => {
    const base = { multiAccount: false, provider: null, returnUrl: null };
    expect(shouldResolveLoginView(base)).toBe(false);
    expect(shouldResolveLoginView({ ...base, returnUrl: '/personal' })).toBe(
      false
    );
    expect(shouldResolveLoginView({ ...base, provider: 'google' })).toBe(true);
    expect(shouldResolveLoginView({ ...base, returnUrl: edufest })).toBe(true);
    expect(
      shouldResolveLoginView({
        multiAccount: true,
        provider: 'google',
        returnUrl: edufest,
      })
    ).toBe(false);
  });
});

describe('focused external sign-in', () => {
  const view = {
    hasSession: false,
    providerHint: 'google' as const,
    returnApp: { id: 'edufest', name: 'EduFest Booth Hall' },
    savedAccounts: [],
    session: null,
  };

  it('needs a provider hint and a registry-validated return app', () => {
    expect(isFocusedExternalSignIn(view, false)).toBe(true);
    expect(isFocusedExternalSignIn({ ...view, returnApp: null }, false)).toBe(
      false
    );
    expect(
      isFocusedExternalSignIn({ ...view, providerHint: null }, false)
    ).toBe(false);
    expect(isFocusedExternalSignIn(view, true)).toBe(false);
    expect(isFocusedExternalSignIn(undefined, false)).toBe(false);
  });

  it('reserves the focused frame only for absolute returns with a hint', () => {
    expect(
      mayBeFocusedExternalSignIn({
        multiAccount: false,
        provider: 'google',
        returnUrl: edufest,
      })
    ).toBe(true);
    expect(
      mayBeFocusedExternalSignIn({
        multiAccount: false,
        provider: 'google',
        returnUrl: '/personal',
      })
    ).toBe(false);
  });

  it('picks one decision per step', () => {
    const step = (overrides = {}) =>
      resolveFocusedSignInStep({
        anotherAccountRequested: false,
        hasSession: false,
        savedAccounts: [],
        ...overrides,
      });
    expect(step({ hasSession: true })).toBe('continue');
    expect(step({ savedAccounts: [account] })).toBe('choose');
    expect(step()).toBe('provider');
    expect(step({ savedAccounts: null })).toBe('provider');
    expect(step({ anotherAccountRequested: true, hasSession: true })).toBe(
      'provider'
    );
  });
});

describe('canAutoStartProvider', () => {
  const auto = {
    anotherAccountRequested: false,
    hasSession: false,
    multiAccount: false,
    providerHint: 'google' as const,
    savedAccounts: [],
  };

  it('starts the hint on a device known to have no session or saved account', () => {
    expect(canAutoStartProvider(auto)).toBe(true);
    expect(
      canAutoStartProvider({
        ...auto,
        anotherAccountRequested: true,
        savedAccounts: [account],
      })
    ).toBe(true);
  });

  it.each([
    ['the saved accounts are unknown', { savedAccounts: null }],
    ['the device has saved accounts', { savedAccounts: [account] }],
    ['a session exists', { hasSession: true }],
    [
      'the request adds an account, even after "Use another account"',
      { anotherAccountRequested: true, multiAccount: true },
    ],
    ['there is no hint', { providerHint: null }],
  ])('waits for a click when %s', (_name, overrides) => {
    expect(canAutoStartProvider({ ...auto, ...overrides })).toBe(false);
  });

  it('scopes "Use another account" to its provider and return', () => {
    expect(getAnotherAccountRequestKey('google', edufest)).not.toBe(
      getAnotherAccountRequestKey('github', edufest)
    );
    expect(getAnotherAccountRequestKey('google', edufest)).not.toBe(
      getAnotherAccountRequestKey('google', null)
    );
  });
});

describe('shouldOfferSavedAccountChooser', () => {
  const base = {
    dismissed: false,
    hasCrossAppReturn: false,
    hasSession: false,
    multiAccount: false,
    providerHint: 'google' as const,
    savedAccounts: [account],
  };

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
    ['the saved accounts are unknown', { savedAccounts: null }],
    ['the request adds an account', { multiAccount: true }],
    ['nothing would leave the page', { providerHint: null }],
  ])('stays hidden when %s', (_name, overrides) => {
    expect(shouldOfferSavedAccountChooser({ ...base, ...overrides })).toBe(
      false
    );
  });
});
