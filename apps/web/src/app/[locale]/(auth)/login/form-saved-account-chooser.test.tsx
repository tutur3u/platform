// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mocks,
  queryClients,
  renderLoginFormSearch,
} from './login-form-test-support';
import type { InitialLoginView } from './login-view';

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
    returnApp: null,
    savedAccounts: [savedAccount],
    session: null,
    ...overrides,
  };
}

const edufestSearch = `?provider=google&returnUrl=${encodeURIComponent(
  'https://showcase.ieeai.net/edufest/verify-token?state=s'
)}`;

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
  mocks.signInWithOAuth.mockResolvedValue({ error: null });
  mocks.switchAccount.mockResolvedValue({ success: true });
});

afterEach(() => {
  for (const client of queryClients) client.clear();
  queryClients.clear();
});

describe('LoginForm saved-account chooser', () => {
  it('offers saved accounts on first paint instead of a forced provider redirect', async () => {
    renderLoginFormSearch(edufestSearch, { initialView: view() });

    expect(screen.getByText('login.choose_account_title')).toBeInTheDocument();
    expect(screen.getByText('Saved Person')).toBeInTheDocument();
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'login.continue_with_email' })
    ).not.toBeInTheDocument();
  });

  it('switches to a picked saved account', async () => {
    renderLoginFormSearch(edufestSearch, { initialView: view() });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Saved Person/ }));
    });

    expect(mocks.switchAccount).toHaveBeenCalledWith('saved-user', {
      targetRoute: expect.stringContaining('/login?provider=google'),
    });
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('fast-tracks the hinted provider only after "Use another account"', async () => {
    renderLoginFormSearch(edufestSearch, { initialView: view() });

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

  it('starts the hinted provider at once when the device has no saved accounts', async () => {
    renderLoginFormSearch('?provider=google', {
      initialView: view({ savedAccounts: [] }),
    });

    await waitFor(() => {
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google' })
      );
    });
    expect(
      screen.queryByText('login.choose_account_title')
    ).not.toBeInTheDocument();
  });

  it('keeps the plain sign-in form for a request without a hint or cross-app return', async () => {
    renderLoginFormSearch('', {
      initialView: view({ providerHint: null }),
    });

    expect(
      screen.queryByText('login.choose_account_title')
    ).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('never auto-starts the hinted provider in add-account mode', async () => {
    renderLoginFormSearch('?provider=google&multiAccount=true', {
      initialView: view(),
    });

    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
    expect(
      screen.queryByText('login.choose_account_title')
    ).not.toBeInTheDocument();
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('waits for a click when the saved accounts could not be read', async () => {
    renderLoginFormSearch('?provider=google', {
      initialView: view({ savedAccounts: null }),
    });

    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('does not carry "Use another account" into an add-account request', async () => {
    const rendered = renderLoginFormSearch(edufestSearch, {
      initialView: view(),
    });
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
    mocks.signInWithOAuth.mockClear();
    mocks.searchParams = new URLSearchParams(
      `?provider=github&multiAccount=true`
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'login.use_another_account' })
    );
    rendered.rerender();

    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });
});
