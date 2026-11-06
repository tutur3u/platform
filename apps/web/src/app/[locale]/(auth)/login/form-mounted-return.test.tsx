import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mocks,
  queryClients,
  renderLoginForm,
  resetReturnUrlLoginMocks,
} from './login-form-test-support';

// An app mounted on the platform apex (`tuturuuu.com/<app>`, one-origin
// super-app) returns through its own verify-token page under the mount.
const mountedInventoryReturnUrl =
  'https://tuturuuu.com/inventory/verify-token?nextUrl=%2Fpersonal%2Fcatalog';

describe('LoginForm returns for apps mounted on the platform apex', () => {
  beforeEach(resetReturnUrlLoginMocks);

  afterEach(() => {
    for (const queryClient of queryClients) queryClient.clear();
    queryClients.clear();
    vi.unstubAllEnvs();
  });

  it('returns a mounted verify-token URL to its app, inside the mount', async () => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', 'inventory');
    const tokenizedReturnUrl =
      'https://tuturuuu.com/inventory/verify-token?nextUrl=%2Fpersonal%2Fcatalog&token=cross-app-token&originApp=web&targetApp=inventory';
    mocks.createCrossAppReturnUrlWithInternalApi.mockResolvedValue({
      returnUrl: tokenizedReturnUrl,
      targetApp: 'inventory',
    });

    renderLoginForm(mountedInventoryReturnUrl);

    await waitFor(() => {
      expect(mocks.assign).toHaveBeenCalledWith(tokenizedReturnUrl);
    });
    expect(mocks.createCrossAppReturnUrlWithInternalApi).toHaveBeenCalledWith({
      returnUrl: mountedInventoryReturnUrl,
    });
    expect(mocks.replace).not.toHaveBeenCalledWith('/personal/catalog');
  });

  it('never mints a token for an app that is not routed on the apex yet', async () => {
    renderLoginForm(mountedInventoryReturnUrl);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/personal/catalog');
    });
    expect(mocks.createCrossAppReturnUrlWithInternalApi).not.toHaveBeenCalled();
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it.each([
    'https://tuturuuu.com/not-an-app/verify-token?nextUrl=%2Fx',
    'https://tuturuuu.com/platform/verify-token?nextUrl=%2Fx',
  ])('keeps platform handling for unregistered mounts: %s', async (url) => {
    renderLoginForm(url);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/x');
    });
    expect(mocks.createCrossAppReturnUrlWithInternalApi).not.toHaveBeenCalled();
  });
});
