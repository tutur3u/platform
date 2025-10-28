import type { AddAccountOptions } from '@tuturuuu/auth';
import type { SupabaseClient } from '@tuturuuu/supabase/next/client';
import type { SupabaseSession } from '@tuturuuu/supabase/next/user';

interface PrepareAddAccountParams {
  createClient: () => SupabaseClient;
  addAccount: (
    session: SupabaseSession,
    options?: AddAccountOptions
  ) => Promise<{ success: boolean; error?: string }>;
  accounts: Array<{ id: string }>;
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
  createClient,
  addAccount,
  accounts,
}: PrepareAddAccountParams): Promise<void> {
  try {
    // First, ensure the current session is saved to the store
    // This prevents losing the current account when adding a new one
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[prepareAddAccountAndNavigate] Session exists:',
        !!session,
        'Accounts count:',
        accounts.length
      );
    }

    if (session) {
      // Check if current session is already in the store
      const currentAccountExists = accounts.some(
        (acc) => acc.id === session.user.id
      );

      if (process.env.NODE_ENV === 'development') {
        console.log(
          '[prepareAddAccountAndNavigate] Current account in store:',
          currentAccountExists
        );
      }

      if (!currentAccountExists) {
        // Save current session before navigating away
        if (process.env.NODE_ENV === 'development') {
          console.log(
            '[prepareAddAccountAndNavigate] Saving current session before navigating...'
          );
        }
        await addAccount(session, {
          switchImmediately: false,
        });
      }
    }

    // Navigate to login with multiAccount flag
    // Note: Using hard reload (window.location.href) is required here because:
    // - The login page needs a clean auth state
    // - Server components need to re-render with new session context
    // - Supabase auth cookies need to be properly set/cleared
    const currentPath = window.location.pathname;
    const returnUrl = encodeURIComponent(currentPath);
    window.location.href = `/login?multiAccount=true&returnUrl=${returnUrl}`;
  } catch (error) {
    console.error(
      '[prepareAddAccountAndNavigate] Failed to prepare for adding account:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    // Still navigate even if saving fails to prevent user from being stuck
    const currentPath = window.location.pathname;
    const returnUrl = encodeURIComponent(currentPath);
    window.location.href = `/login?multiAccount=true&returnUrl=${returnUrl}`;
  }
}
