// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mocks,
  queryClients,
  renderLoginForm,
  resetReturnUrlLoginMocks,
} from './login-form-test-support';

const returnUrl =
  'https://mail.tuturuuu.com/verify-token?nextUrl=%2Fpersonal%2Finbox';
const tokenizedUrl = `${returnUrl}&token=cross-app-token&originApp=web&targetApp=mail`;

async function verifyTotp() {
  fireEvent.change(await screen.findByLabelText('otp-input'), {
    target: { value: '123456' },
  });
  const verifyButton = await screen.findByRole('button', {
    name: 'login.verify_button',
  });
  await act(async () => {
    fireEvent.click(verifyButton);
  });
}

describe('LoginForm cross-app handoff MFA step-up', () => {
  beforeEach(resetReturnUrlLoginMocks);

  afterEach(() => {
    for (const queryClient of queryClients) queryClient.clear();
    queryClients.clear();
    mocks.createCrossAppReturnUrlWithInternalApi.mockReset();
    vi.unstubAllEnvs();
  });

  it('prompts for MFA when the mint requires it, then mints and returns to the app', async () => {
    mocks.createCrossAppReturnUrlWithInternalApi
      .mockResolvedValueOnce({ code: 'MFA_REQUIRED' })
      .mockResolvedValueOnce({ returnUrl: tokenizedUrl, targetApp: 'mail' });

    renderLoginForm(returnUrl);

    await screen.findByText('login.two_factor_authentication');
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(
      screen.queryByText('login.cross_app_handoff_error_title')
    ).not.toBeInTheDocument();

    await verifyTotp();

    await waitFor(() => {
      expect(mocks.assign).toHaveBeenCalledWith(tokenizedUrl);
    });
    expect(mocks.mfaVerify).toHaveBeenCalled();
    expect(mocks.createCrossAppReturnUrlWithInternalApi).toHaveBeenCalledTimes(
      2
    );
    expect(mocks.routerReplace).not.toHaveBeenCalledWith('/');
  });

  it('asks the mint for a recent second factor when the returning app wants one, before and after the step-up', async () => {
    // A signed-in session whose second factor is older than the app accepts.
    mocks.createCrossAppReturnUrlWithInternalApi
      .mockResolvedValueOnce({ code: 'MFA_REQUIRED' })
      .mockResolvedValueOnce({ returnUrl: tokenizedUrl, targetApp: 'mail' });

    renderLoginForm(returnUrl);
    mocks.searchParams.set('mfaMaxAge', '30');

    await screen.findByText('login.two_factor_authentication');
    await verifyTotp();

    await waitFor(() => {
      expect(mocks.assign).toHaveBeenCalledWith(tokenizedUrl);
    });
    expect(
      mocks.createCrossAppReturnUrlWithInternalApi.mock.calls.map(
        ([payload]) => [payload.mfaMaxAge, payload.returnUrl]
      )
    ).toEqual([
      [30, returnUrl],
      [30, returnUrl],
    ]);
  });

  it('shows a retry instead of looping when the mint still requires MFA after step-up', async () => {
    mocks.createCrossAppReturnUrlWithInternalApi.mockResolvedValue({
      code: 'MFA_REQUIRED',
    });

    renderLoginForm(returnUrl);

    await screen.findByText('login.two_factor_authentication');
    await verifyTotp();

    await screen.findByText('login.cross_app_handoff_session_failed');
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.createCrossAppReturnUrlWithInternalApi).toHaveBeenCalledTimes(
      2
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'login.cross_app_handoff_retry' })
    );
    expect(mocks.reload).toHaveBeenCalledOnce();
  });

  it.each([
    ['a token mint failure', { error: 'Failed to generate token' }],
    ['unavailable assurance', { code: 'AUTH_UNAVAILABLE' }],
  ])('offers a retry for %s', async (_name, response) => {
    mocks.createCrossAppReturnUrlWithInternalApi.mockResolvedValue(response);

    renderLoginForm(returnUrl);

    await screen.findByText('login.cross_app_handoff_session_failed');
    expect(
      screen.queryByText('login.two_factor_authentication')
    ).not.toBeInTheDocument();
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('continues a confirmed external return after step-up without asking again', async () => {
    vi.stubEnv(
      'NEXT_PUBLIC_TUTURUUU_EXTERNAL_APP_DOMAINS',
      'partner:https://partner.example'
    );
    vi.stubEnv('TUTURUUU_EXTERNAL_APP_DOMAINS', '');
    const partnerReturnUrl = 'https://partner.example/verify-token?state=s';
    const partnerTokenized = `${partnerReturnUrl}&token=t&originApp=web&targetApp=partner`;
    mocks.resolveCrossAppReturnUrlWithInternalApi.mockResolvedValue({
      appName: 'Partner Portal',
      targetApp: 'partner',
    });
    mocks.createCrossAppReturnUrlWithInternalApi
      .mockResolvedValueOnce({ code: 'MFA_REQUIRED' })
      .mockResolvedValueOnce({
        returnUrl: partnerTokenized,
        targetApp: 'partner',
      });

    renderLoginForm(partnerReturnUrl);

    await screen.findByText('login.confirm_internal_app_account_title');
    expect(mocks.createCrossAppReturnUrlWithInternalApi).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', {
          name: /login\.continue_as/,
        })
      );
    });

    await screen.findByText('login.two_factor_authentication');
    await verifyTotp();

    await waitFor(() => {
      expect(mocks.assign).toHaveBeenCalledWith(partnerTokenized);
    });
    expect(mocks.createCrossAppReturnUrlWithInternalApi).toHaveBeenCalledTimes(
      2
    );
  });

  it('still asks for a requested confirmation after an automatic step-up', async () => {
    mocks.createCrossAppReturnUrlWithInternalApi.mockResolvedValueOnce({
      code: 'MFA_REQUIRED',
    });

    renderLoginForm(returnUrl);

    await screen.findByText('login.two_factor_authentication');
    mocks.searchParams.set('confirmAccount', '1');
    await verifyTotp();

    await screen.findByText('login.confirm_internal_app_account_title');
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.createCrossAppReturnUrlWithInternalApi).toHaveBeenCalledOnce();
  });

  it('shows the refresh retry when the session refresh returns an error', async () => {
    mocks.createCrossAppReturnUrlWithInternalApi.mockResolvedValue({
      returnUrl: tokenizedUrl,
      targetApp: 'mail',
    });
    mocks.refreshSession.mockResolvedValue({
      error: new Error('Fixture refresh error'),
    });

    renderLoginForm(returnUrl);

    await screen.findByText('login.cross_app_handoff_refresh_failed');
    expect(mocks.assign).not.toHaveBeenCalled();
  });
});
