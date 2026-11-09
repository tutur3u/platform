import type {
  AccountOperationResult,
  AddAccountOptions,
} from '@/context/account-switcher-context';

interface PrepareAddAccountParams {
  saveCurrentAccount: (
    options?: AddAccountOptions
  ) => Promise<AccountOperationResult>;
}

/**
 * Saves the current session, then opens login so another account can be added.
 * A full account list stays on this page and returns the limit result.
 */
export async function prepareAddAccountAndNavigate({
  saveCurrentAccount,
}: PrepareAddAccountParams): Promise<AccountOperationResult> {
  const currentRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  const returnUrl = encodeURIComponent(currentRoute);
  const loginUrl = `/login?multiAccount=true&returnUrl=${returnUrl}`;

  try {
    const result = await saveCurrentAccount({
      route: currentRoute,
      switchImmediately: false,
    });

    if (!result.success && result.errorCode === 'account_limit') {
      return result;
    }

    // Hard reload so the login page gets a clean auth state.
    window.location.href = loginUrl;
    return result;
  } catch (error) {
    window.location.href = loginUrl;
    return {
      error: error instanceof Error ? error.message : 'save_failed',
      errorCode: 'save_failed',
      success: false,
    };
  }
}
