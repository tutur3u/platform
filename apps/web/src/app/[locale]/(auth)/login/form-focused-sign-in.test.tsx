// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mocks,
  queryClients,
  renderLoginFormSearch,
} from './login-form-test-support';
import type { InitialLoginView } from './login-view';

const returnUrl =
  'https://showcase.ieeai.net/edufest/verify-token?for=player&state=s';
const search = `?provider=google&returnUrl=${encodeURIComponent(returnUrl)}`;
const savedAccount = {
  email: 'saved@example.com',
  id: 'saved-user',
  metadata: {
    addedAt: null,
    avatarUrl: null,
    displayName: 'Saved Person',
    lastActiveAt: null,
    lastRoute: null,
    lastWorkspaceId: null,
  },
};

function view(overrides: Partial<InitialLoginView> = {}): InitialLoginView {
  return {
    hasSession: false,
    providerHint: 'google',
    returnApp: { id: 'edufest', name: 'EduFest Booth Hall' },
    savedAccounts: [],
    session: null,
    ...overrides,
  };
}

function expectOnlyFocusedCard() {
  for (const name of [
    'login.continue_with_apple',
    'login.continue_with_github',
    'login.continue_with_google',
    'login.continue_with_email',
  ]) {
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUserProfile = null;
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.getClaims.mockResolvedValue({ data: { claims: null }, error: null });
  mocks.getOtpSettings.mockResolvedValue({ otpEnabled: true });
  mocks.mfaAssuranceLevel.mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: 'aal1' },
  });
  mocks.resolveCrossAppReturnUrlWithInternalApi.mockResolvedValue({
    appName: 'EduFest Booth Hall',
    targetApp: 'edufest',
  });
  mocks.refreshSession.mockResolvedValue({ error: null });
  mocks.signInWithOAuth.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.switchAccount.mockResolvedValue({ success: true });
});

afterEach(() => {
  for (const client of queryClients) client.clear();
  queryClients.clear();
});

describe('LoginForm focused external sign-in', () => {
  it('holds a fixed skeleton while the view resolves', () => {
    renderLoginFormSearch(search, { loginViewPending: true });

    expectOnlyFocusedCard();
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('goes straight to Google without a session or saved account', async () => {
    mocks.getUser.mockReturnValue(new Promise(() => {}));

    renderLoginFormSearch(search, { initialView: view() });

    expect(
      screen.getByText('login.continuing_with_provider')
    ).toBeInTheDocument();
    expectOnlyFocusedCard();
    await waitFor(() => {
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google' })
      );
    });
  });

  it('offers only "Continue" for an existing session, then hands off', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: 'person@example.com', id: 'user-1' } },
    });
    const tokenized = `${returnUrl}&token=t&originApp=web&targetApp=edufest`;
    mocks.createCrossAppReturnUrlWithInternalApi.mockResolvedValue({
      returnUrl: tokenized,
      targetApp: 'edufest',
    });

    renderLoginFormSearch(search, {
      initialView: view({
        hasSession: true,
        savedAccounts: [savedAccount],
        session: { avatarUrl: null, id: 'user-1', name: 'Person Example' },
      }),
    });

    expect(screen.getByText('Person Example')).toBeInTheDocument();
    expectOnlyFocusedCard();
    const continueButton = screen.getByRole('button', {
      name: 'login.continue_to_internal_app',
    });
    await waitFor(() => expect(continueButton).toBeEnabled());
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(continueButton);
    });

    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith(tokenized));
    expect(mocks.createCrossAppReturnUrlWithInternalApi).toHaveBeenCalledWith(
      expect.objectContaining({ expectedUserId: 'user-1', returnUrl })
    );
    expect(screen.getByText('Person Example')).toBeInTheDocument();
  });

  it('sends "Use another account" from a session straight to Google', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: 'person@example.com', id: 'user-1' } },
    });

    renderLoginFormSearch(search, {
      initialView: view({
        hasSession: true,
        savedAccounts: [savedAccount],
        session: { avatarUrl: null, id: 'user-1', name: 'Person Example' },
      }),
    });
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'login.use_another_account' })
      );
    });

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    await waitFor(() => {
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google' })
      );
    });
    expect(screen.queryByText('login.choose_account_title')).toBeNull();
  });

  it('lists saved accounts as one-tap choices before Google', async () => {
    renderLoginFormSearch(search, {
      initialView: view({ savedAccounts: [savedAccount] }),
    });

    expect(screen.getByText('login.choose_account_title')).toBeInTheDocument();
    expectOnlyFocusedCard();
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Saved Person/ }));
    });
    expect(mocks.switchAccount).toHaveBeenCalledWith(
      'saved-user',
      expect.anything()
    );
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('starts Google from the saved-account step only on "Use another account"', async () => {
    renderLoginFormSearch(search, {
      initialView: view({ savedAccounts: [savedAccount] }),
    });
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());

    fireEvent.click(
      screen.getByRole('button', { name: 'login.use_another_account' })
    );

    await waitFor(() => {
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google' })
      );
    });
  });

  it('keeps the regular sign-in for an unregistered return target', async () => {
    renderLoginFormSearch(search, {
      initialView: view({ returnApp: null }),
    });

    expect(
      screen.queryByText('login.continuing_with_provider')
    ).not.toBeInTheDocument();
  });

  it('hands over to the regular confirmation when the browser is another account', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: 'other@example.com', id: 'user-2' } },
    });

    renderLoginFormSearch(search, {
      initialView: view({
        hasSession: true,
        session: { avatarUrl: null, id: 'user-1', name: 'Person Example' },
      }),
    });

    await waitFor(() =>
      expect(screen.queryByText('Person Example')).not.toBeInTheDocument()
    );
    expect(mocks.createCrossAppReturnUrlWithInternalApi).not.toHaveBeenCalled();
  });
});
