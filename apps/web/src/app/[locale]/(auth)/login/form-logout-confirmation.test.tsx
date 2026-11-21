// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  mocks,
  queryClients,
  renderLoginFormSearch,
  resetReturnUrlLoginMocks,
} from './login-form-test-support';
beforeEach(resetReturnUrlLoginMocks);
afterEach(() => {
  for (const client of queryClients) client.clear();
  queryClients.clear();
  vi.unstubAllEnvs();
});
it('does not mint or navigate an already authenticated app return until the user confirms', async () => {
  const returnUrl =
    'https://chat.tuturuuu.com/verify-token?nextUrl=%2Fpersonal';
  mocks.createCrossAppReturnUrlWithInternalApi.mockResolvedValue({
    returnUrl: `${returnUrl}&token=fixture`,
    targetApp: 'chat',
  });
  renderLoginFormSearch(
    `?confirmAccount=1&returnUrl=${encodeURIComponent(returnUrl)}`
  );
  await screen.findByText('login.confirm_internal_app_account_title');
  expect(mocks.createCrossAppReturnUrlWithInternalApi).not.toHaveBeenCalled();
  expect(mocks.assign).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /login.continue/ }));
  await waitFor(() =>
    expect(mocks.createCrossAppReturnUrlWithInternalApi).toHaveBeenCalledWith({
      expectedUserId: 'user-1',
      returnUrl,
    })
  );
});
