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
    sessionStatus: 'absent',
    providerHint: 'google',
    returnApp: {
      autoContinue: false,
      id: 'edufest',
      name: 'EduFest Booth Hall',
    },
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
      await screen.findByText('login.continuing_with_provider')
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
        sessionStatus: 'present',
        savedAccounts: [savedAccount],
        session: { avatarUrl: null, id: 'user-1', name: 'Person Example' },
      }),
    });

    expect(screen.getByText('Person Example')).toBeInTheDocument();
    expectOnlyFocusedCard();
    const continueButton = screen.getByRole('button', {
      name: 'login.continue_as',
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
        sessionStatus: 'present',
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
        sessionStatus: 'present',
        session: { avatarUrl: null, id: 'user-1', name: 'Person Example' },
      }),
    });

    await waitFor(() =>
      expect(screen.queryByText('Person Example')).not.toBeInTheDocument()
    );
    expect(mocks.createCrossAppReturnUrlWithInternalApi).not.toHaveBeenCalled();
  });

  it('trusts the server view and never shows the app-link warning beside it', async () => {
    mocks.resolveCrossAppReturnUrlWithInternalApi.mockRejectedValue(
      new Error('Fixture transport failure')
    );

    renderLoginFormSearch(search, { initialView: view() });

    await waitFor(() => {
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google' })
      );
    });
    expect(
      mocks.resolveCrossAppReturnUrlWithInternalApi
    ).not.toHaveBeenCalled();
    expect(
      screen.queryByText('login.invalid_return_url_title')
    ).not.toBeInTheDocument();
  });

  it('never starts the provider beside an unverified return target', async () => {
    mocks.resolveCrossAppReturnUrlWithInternalApi.mockResolvedValue({
      error: 'Invalid returnUrl',
    });

    renderLoginFormSearch(search, {
      initialView: view({ returnApp: null }),
    });

    await screen.findByText('login.invalid_return_url_title');
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('waits for the view before validating or starting anything', async () => {
    renderLoginFormSearch(search, { loginViewPending: true });

    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
    expect(
      mocks.resolveCrossAppReturnUrlWithInternalApi
    ).not.toHaveBeenCalled();
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('keeps waiting while an unverified target is still resolving', async () => {
    mocks.resolveCrossAppReturnUrlWithInternalApi.mockReturnValue(
      new Promise(() => {})
    );

    renderLoginFormSearch(search, {
      initialView: view({ returnApp: null }),
    });

    await waitFor(() =>
      expect(mocks.resolveCrossAppReturnUrlWithInternalApi).toHaveBeenCalled()
    );
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('never starts Google when the server could not read the session', async () => {
    renderLoginFormSearch(search, {
      initialView: view({ sessionStatus: 'unknown' }),
    });

    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
    expect(
      screen.getByRole('button', { name: 'login.continue_with_provider' })
    ).toBeEnabled();
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('offers Continue for a server session the browser cannot read', async () => {
    const missing = Object.assign(new Error('Auth session missing!'), {
      name: 'AuthSessionMissingError',
    });
    mocks.refreshSession.mockResolvedValue({ error: missing });
    const tokenized = `${returnUrl}&token=t&originApp=web&targetApp=edufest`;
    mocks.createCrossAppReturnUrlWithInternalApi.mockResolvedValue({
      returnUrl: tokenized,
      targetApp: 'edufest',
    });

    renderLoginFormSearch(search, {
      initialView: view({
        hasSession: true,
        sessionStatus: 'present',
        session: { avatarUrl: null, id: 'user-1', name: 'Person Example' },
      }),
    });

    const continueButton = await screen.findByRole('button', {
      name: 'login.continue_as',
    });
    await waitFor(() => expect(continueButton).toBeEnabled());
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(continueButton);
    });

    await waitFor(() =>
      expect(mocks.createCrossAppReturnUrlWithInternalApi).toHaveBeenCalledWith(
        expect.objectContaining({ expectedUserId: 'user-1', returnUrl })
      )
    );
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith(tokenized));
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('shows a pending Continue with both actions disabled while the handoff runs', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: 'person@example.com', id: 'user-1' } },
    });
    mocks.createCrossAppReturnUrlWithInternalApi.mockReturnValue(
      new Promise(() => {})
    );

    renderLoginFormSearch(search, {
      initialView: view({
        hasSession: true,
        sessionStatus: 'present',
        session: { avatarUrl: null, id: 'user-1', name: 'Person Example' },
      }),
    });

    const continueButton = await screen.findByRole('button', {
      name: 'login.continue_as',
    });
    await waitFor(() => expect(continueButton).toBeEnabled());
    await act(async () => {
      fireEvent.click(continueButton);
    });

    // The card says where it is going until the browser leaves.
    expect(await screen.findByRole('status')).toHaveTextContent(
      'login.returning_to_app'
    );
    expect(
      screen.queryByRole('button', { name: 'login.continue_as' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'login.use_another_account' })
    ).toBeDisabled();
  });
});

describe('LoginForm focused sign-in auto-continue', () => {
  const sessionView = (autoContinue: boolean, providerHint = true) =>
    view({
      hasSession: true,
      providerHint: providerHint ? 'google' : null,
      returnApp: { autoContinue, id: 'edufest', name: 'EduFest Booth Hall' },
      sessionStatus: 'present',
      session: { avatarUrl: null, id: 'user-1', name: 'Person Example' },
    });
  const tokenized = `${returnUrl}&token=t&originApp=web&targetApp=edufest`;

  beforeEach(() => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: 'person@example.com', id: 'user-1' } },
    });
    mocks.createCrossAppReturnUrlWithInternalApi.mockResolvedValue({
      returnUrl: tokenized,
      targetApp: 'edufest',
    });
  });

  it('continues a strict PKCE app on its own, after a cancellable pause', async () => {
    renderLoginFormSearch(search, { initialView: sessionView(true) });

    expect(await screen.findByRole('status')).toHaveTextContent(
      'login.signing_you_in_to'
    );
    expect(
      screen.getByRole('button', { name: 'login.auto_continue_cancel' })
    ).toBeEnabled();
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith(tokenized), {
      timeout: 4000,
    });
    expect(mocks.createCrossAppReturnUrlWithInternalApi).toHaveBeenCalledTimes(
      1
    );
    expect(mocks.createCrossAppReturnUrlWithInternalApi).toHaveBeenCalledWith(
      expect.objectContaining({ expectedUserId: 'user-1', returnUrl })
    );
  });

  it('never continues on its own for an app without the strict gate', async () => {
    renderLoginFormSearch(search, { initialView: sessionView(false) });

    const continueButton = await screen.findByRole('button', {
      name: 'login.continue_as',
    });
    await waitFor(() => expect(continueButton).toBeEnabled());
    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(mocks.createCrossAppReturnUrlWithInternalApi).not.toHaveBeenCalled();
    expect(screen.queryByText('login.signing_you_in_to')).toBeNull();
  });

  it('stops for good on Cancel and leaves the explicit Continue', async () => {
    renderLoginFormSearch(search, { initialView: sessionView(true) });

    fireEvent.click(
      await screen.findByRole('button', { name: 'login.auto_continue_cancel' })
    );
    const continueButton = await screen.findByRole('button', {
      name: 'login.continue_as',
    });
    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(mocks.createCrossAppReturnUrlWithInternalApi).not.toHaveBeenCalled();
    expect(continueButton).toBeEnabled();
  });

  it('holds the countdown while Cancel has focus', async () => {
    renderLoginFormSearch(search, { initialView: sessionView(true) });

    const cancel = await screen.findByRole('button', {
      name: 'login.auto_continue_cancel',
    });
    act(() => cancel.focus());
    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(mocks.createCrossAppReturnUrlWithInternalApi).not.toHaveBeenCalled();

    act(() => cancel.blur());
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith(tokenized), {
      timeout: 4000,
    });
  });

  it('never continues on its own for a session the browser does not hold', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: 'other@example.com', id: 'user-2' } },
    });

    renderLoginFormSearch(search, { initialView: sessionView(true) });

    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(mocks.createCrossAppReturnUrlWithInternalApi).not.toHaveBeenCalled();
  });

  it('lands on the focused card after the provider round trip, without a hint', async () => {
    renderLoginFormSearch(`?returnUrl=${encodeURIComponent(returnUrl)}`, {
      initialView: sessionView(false, false),
    });

    expect(
      await screen.findByRole('button', { name: 'login.continue_as' })
    ).toBeInTheDocument();
    expect(screen.getByText('Person Example')).toBeInTheDocument();
    expectOnlyFocusedCard();
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('sends "Use another account" without a hint to the full sign-in form', async () => {
    renderLoginFormSearch(`?returnUrl=${encodeURIComponent(returnUrl)}`, {
      initialView: sessionView(false, false),
    });
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'login.use_another_account' })
      );
    });

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(
      await screen.findByPlaceholderText('login.email_username_placeholder')
    ).toBeInTheDocument();
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });
});

describe('LoginForm focused provider step', () => {
  it('keeps the return and challenge when "More options" drops the hint', async () => {
    const pkce =
      'code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256';
    mocks.getUser.mockReturnValue(new Promise(() => {}));
    renderLoginFormSearch(`${search}&${pkce}`, {
      initialView: view({ sessionStatus: 'unknown' }),
    });

    fireEvent.click(
      await screen.findByRole('button', { name: 'login.more_sign_in_options' })
    );

    expect(mocks.routerReplace).toHaveBeenCalledTimes(1);
    const next = new URL(
      mocks.routerReplace.mock.calls[0]?.[0] as string,
      'https://tuturuuu.com'
    );
    expect(next.pathname).toBe('/login');
    expect(next.searchParams.has('provider')).toBe(false);
    expect(next.searchParams.get('returnUrl')).toBe(returnUrl);
    expect(next.searchParams.get('code_challenge_method')).toBe('S256');
  });
});
