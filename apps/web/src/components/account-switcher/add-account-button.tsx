'use client';

import { useAccountSwitcher } from '@/context/account-switcher-context';
import { Plus } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function AddAccountButton() {
  const t = useTranslations();
  const { addAccount, accounts } = useAccountSwitcher();
  const [isLoading, setIsLoading] = useState(false);

  const handleAddAccount = async () => {
    setIsLoading(true);
    try {
      // First, ensure the current session is saved to the store
      // This prevents losing the current account when adding a new one
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (process.env.NODE_ENV === 'development') {
        console.log(
          '[AddAccountButton] Session exists:',
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
            '[AddAccountButton] Current account in store:',
            currentAccountExists
          );
        }

        if (!currentAccountExists) {
          // Save current session before navigating away
          if (process.env.NODE_ENV === 'development') {
            console.log(
              '[AddAccountButton] Saving current session before navigating...'
            );
          }
          await addAccount(session, {
            switchImmediately: false,
          });
        }
      }

      // Navigate to login with multiAccount flag
      const currentPath = window.location.pathname;
      const returnUrl = encodeURIComponent(currentPath);
      window.location.href = `/login?multiAccount=true&returnUrl=${returnUrl}`;
    } catch (error) {
      console.error(
        '[AddAccountButton] Failed to prepare for adding account:',
        error instanceof Error ? error.message : 'Unknown error'
      );
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleAddAccount}
      disabled={isLoading}
      className="w-full justify-start gap-2"
    >
      <Plus className="h-4 w-4" />
      {isLoading
        ? t('account_switcher.preparing')
        : t('account_switcher.add_account')}
    </Button>
  );
}
