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
 * Prepares for adding a new account by:
 * 1. Saving the current session to the store (if not already stored)
 * 2. Navigating to the login page with multiAccount flag
 *
 * This shared logic is used by both AddAccountButton and AccountSwitcherModal
 * to ensure consistent behavior when initiating the add-account flow.
 *
 * @throws Error if preparation fails (navigation will still proceed)
 */
export async function prepareAddAccountAndNavigate({
  saveCurrentAccount,
}: PrepareAddAccountParams): Promise<void> {
  const currentRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  try {
    await saveCurrentAccount({
      route: currentRoute,
      switchImmediately: false,
    });

    // Navigate to login with multiAccount flag
    // Note: Using hard reload (window.location.href) is required here because:
    // - The login page needs a clean auth state
    // - Server components need to re-render with new session context
    // - Supabase auth cookies need to be properly set/cleared
    const returnUrl = encodeURIComponent(currentRoute);
    window.location.href = `/login?multiAccount=true&returnUrl=${returnUrl}`;
  } catch {
    // Still navigate even if saving fails to prevent user from being stuck
    const returnUrl = encodeURIComponent(currentRoute);
    window.location.href = `/login?multiAccount=true&returnUrl=${returnUrl}`;
  }
}
