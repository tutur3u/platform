// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mocks,
  openMoreSignInOptions,
  queryClients,
  renderLoginFormSearch,
} from './login-form-test-support';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.mfaAssuranceLevel.mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: 'aal1' },
  });
  mocks.getOtpSettings.mockResolvedValue({ otpEnabled: true });
  mocks.signInWithOAuth.mockResolvedValue({ error: null });
});

afterEach(() => {
  for (const client of queryClients) client.clear();
  queryClients.clear();
});

describe('LoginForm sign-in methods step', () => {
  it('starts with one decision: Google, email or more options', async () => {
    renderLoginFormSearch('');

    await screen.findByRole('button', { name: /login\.continue_with_google/u });
    expect(
      screen.getByRole('button', { name: /^login\.continue_with_email/u })
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('login.email_username_placeholder')
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('turnstile')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /login\.continue_with_apple/u })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /login\.staff_microsoft/u })
    ).not.toBeInTheDocument();

    await openMoreSignInOptions();

    for (const name of [
      /login\.continue_with_apple/u,
      /login\.continue_with_github/u,
      /login\.staff_microsoft/u,
      /login\.continue_with_passkey/u,
    ]) {
      expect(await screen.findByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('remembers a provider and surfaces it first next time', async () => {
    const first = renderLoginFormSearch('');
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', {
          name: /login\.continue_with_google/u,
        })
      );
    });
    expect(localStorage.getItem('tuturuuu:last-login-method')).toBe('google');
    first.rerender();

    const google = await screen.findByRole('button', {
      name: /login\.continue_with_google/u,
    });
    expect(google).toHaveTextContent('login.last_used');
  });

  it('shows a remembered staff Microsoft sign-in on the first step', async () => {
    localStorage.setItem('tuturuuu:last-login-method', 'azure');

    renderLoginFormSearch('');

    const microsoft = await screen.findByRole('button', {
      name: /login\.staff_microsoft/u,
    });
    expect(microsoft).toHaveTextContent('login.last_used');
    // The help note stays in the disclosure so a remembered method never
    // changes the first step's height.
    expect(
      screen.queryByText('login.microsoft_email_recovery')
    ).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('opens the email step with the security check and passkey', async () => {
    renderLoginFormSearch('');

    fireEvent.click(
      await screen.findByRole('button', {
        name: /^login\.continue_with_email/u,
      })
    );

    const emailInput = await screen.findByPlaceholderText(
      'login.email_username_placeholder'
    );
    await waitFor(() => expect(emailInput).toHaveFocus());
    expect(
      screen.getByRole('button', { name: 'continue_with_passkey' })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'login.other_sign_in_methods' })
    );
    const google = await screen.findByRole('button', {
      name: /login\.continue_with_google/u,
    });
    await waitFor(() => expect(google).toHaveFocus());
  });

  it('offers a labelled staff Microsoft entry with email recovery', async () => {
    mocks.currentUserProfile = null;
    mocks.getUser.mockReturnValue(new Promise(() => undefined));

    renderLoginFormSearch('');

    await openMoreSignInOptions();

    expect(
      await screen.findByRole('button', {
        name: /login\.staff_microsoft/u,
      })
    ).toBeInTheDocument();
  });

  it('does not automatically start Microsoft OAuth from a provider hint', async () => {
    mocks.currentUserProfile = null;
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    renderLoginFormSearch('?provider=azure');
    await openMoreSignInOptions();
    await screen.findByRole('button', {
      name: 'Microsoft login.staff_microsoft',
    });
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
    expect(
      screen.getByText('login.microsoft_email_recovery')
    ).toBeInTheDocument();
  });
});
