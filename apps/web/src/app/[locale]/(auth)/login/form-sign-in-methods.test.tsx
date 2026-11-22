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

/** Focusable controls of the first step, in document (tab) order. */
function tabOrder() {
  return [...document.querySelectorAll<HTMLElement>('input, button')].map(
    (element) =>
      element.getAttribute('placeholder') ?? element.textContent?.trim() ?? ''
  );
}

describe('LoginForm email-first sign-in step', () => {
  it('leads with email, then Google, passkey and more options', async () => {
    renderLoginFormSearch('');

    const email = await screen.findByPlaceholderText(
      'login.email_username_placeholder'
    );
    expect(screen.getByText('login.email_or_username')).toBeInTheDocument();
    expect(email).not.toHaveFocus();
    await screen.findByRole('button', { name: /login\.continue_with_google/u });
    expect(
      screen.getByRole('button', { name: 'continue_with_passkey' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /login\.continue_with_apple/u })
    ).not.toBeInTheDocument();

    const order = tabOrder();
    const index = (label: string) =>
      order.findIndex((entry) => entry.startsWith(label));
    expect(index('login.email_username_placeholder')).toBe(0);
    expect(index('login.continue_with_email')).toBeGreaterThan(0);
    expect(index('login.continue_with_google')).toBeGreaterThan(
      index('login.continue_with_email')
    );
    expect(index('continue_with_passkey')).toBeGreaterThan(
      index('login.continue_with_google')
    );
    expect(index('login.more_sign_in_options')).toBeGreaterThan(
      index('continue_with_passkey')
    );

    await openMoreSignInOptions();

    for (const name of [
      /login\.continue_with_apple/u,
      /login\.continue_with_github/u,
      /login\.staff_microsoft/u,
    ]) {
      expect(await screen.findByRole('button', { name })).toBeInTheDocument();
    }
    expect(
      screen.getByText('login.microsoft_email_recovery')
    ).toBeInTheDocument();
  });

  it('remembers a provider and marks it last used next time', async () => {
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
    expect(google).toHaveAccessibleName(/login\.last_used/u);
  });

  it('promotes a remembered staff Microsoft sign-in onto the first step', async () => {
    localStorage.setItem('tuturuuu:last-login-method', 'azure');

    renderLoginFormSearch('');

    const microsoft = await screen.findByRole('button', {
      name: /login\.staff_microsoft/u,
    });
    expect(microsoft).toHaveAccessibleName(/login\.last_used/u);
    // The help note stays in the disclosure so a remembered method never
    // changes the first step's height.
    expect(
      screen.queryByText('login.microsoft_email_recovery')
    ).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('marks the email field when email was the last method', async () => {
    localStorage.setItem('tuturuuu:last-login-method', 'email');

    renderLoginFormSearch('');

    await screen.findByPlaceholderText('login.email_username_placeholder');
    expect(screen.getByText('login.last_used')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /login\.continue_with_google/u })
    ).not.toHaveAccessibleName(/login\.last_used/u);
  });

  it('does not automatically start Microsoft OAuth from a provider hint', async () => {
    mocks.currentUserProfile = null;
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    renderLoginFormSearch('?provider=azure');
    await openMoreSignInOptions();
    await screen.findByRole('button', { name: /login\.staff_microsoft/u });
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
    expect(
      screen.getByText('login.microsoft_email_recovery')
    ).toBeInTheDocument();
  });
});
