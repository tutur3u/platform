// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { normalizeClientRedirectPath } from '@tuturuuu/auth/cross-app';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mocks,
  queryClients,
  renderLoginFormSearch,
  resetReturnUrlLoginMocks,
} from './login-form-test-support';

const consentPath = '/en/sso/consent?transaction=tx-1';

function stepUpSearch(nextUrl: string) {
  return `?mfa=required&nextUrl=${encodeURIComponent(nextUrl)}`;
}

async function verifyTotp() {
  fireEvent.change(await screen.findByLabelText('otp-input'), {
    target: { value: '123456' },
  });
  await act(async () => {
    fireEvent.click(
      await screen.findByRole('button', { name: 'login.verify_button' })
    );
  });
}

describe('LoginForm /login?mfa=required', () => {
  beforeEach(() => {
    resetReturnUrlLoginMocks();
    mocks.mfaAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });
  });

  afterEach(() => {
    for (const queryClient of queryClients) queryClient.clear();
    queryClients.clear();
  });

  it('challenges a signed-in aal1 session, then continues to the normalized nextUrl', async () => {
    renderLoginFormSearch(stepUpSearch(consentPath));

    await screen.findByText('login.two_factor_authentication');
    expect(mocks.routerPush).not.toHaveBeenCalled();

    await verifyTotp();

    await waitFor(() => {
      expect(mocks.routerPush).toHaveBeenCalledWith(
        normalizeClientRedirectPath(consentPath)
      );
    });
    expect(mocks.mfaVerify).toHaveBeenCalled();
  });

  it('does not widen redirects: an off-site nextUrl still goes through the normalizer', async () => {
    const hostile = 'https://evil.example/steal';
    renderLoginFormSearch(stepUpSearch(hostile));

    await screen.findByText('login.two_factor_authentication');
    await verifyTotp();

    await waitFor(() => expect(mocks.routerPush).toHaveBeenCalled());
    const target = mocks.routerPush.mock.calls.at(-1)?.[0];
    expect(target).toBe(normalizeClientRedirectPath(hostile));
    expect(String(target)).not.toContain('evil.example');
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('cannot skip the challenge: without a verified code nothing navigates', async () => {
    renderLoginFormSearch(`${stepUpSearch(consentPath)}&mfa=skip`);

    await screen.findByText('login.two_factor_authentication');
    expect(mocks.routerPush).not.toHaveBeenCalled();
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('continues an already aal2 session to the normalized nextUrl', async () => {
    mocks.mfaAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2' },
      error: null,
    });
    renderLoginFormSearch(stepUpSearch(consentPath));

    await waitFor(() => {
      expect(mocks.routerPush).toHaveBeenCalledWith(
        normalizeClientRedirectPath(consentPath)
      );
    });
    expect(
      screen.queryByText('login.two_factor_authentication')
    ).not.toBeInTheDocument();
  });

  it('offers no mobile approval under the hint, since the step-up needs a code, and signs out through /logout', async () => {
    renderLoginFormSearch(stepUpSearch(consentPath));

    await screen.findByText('login.mfa_step_up_description');
    expect(
      screen.queryByRole('button', { name: 'login.mobile_mfa_button' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'login.required_mfa_sign_out' })
    ).toHaveAttribute('href', '/logout');
  });

  it('keeps mobile approval on an ordinary challenge', async () => {
    renderLoginFormSearch('');

    await screen.findByText('login.enter_authenticator_code');
    expect(
      await screen.findByRole('button', { name: 'login.mobile_mfa_button' })
    ).toBeInTheDocument();
  });
});
