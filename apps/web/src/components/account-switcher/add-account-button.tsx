'use client';

import { useAccountSwitcher } from '@/context/account-switcher-context';
import { Plus } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useState } from 'react';

export function AddAccountButton() {
  const t = useTranslations();
  const params = useParams();
  const locale = params?.locale || 'en';
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

      console.log(
        '[AddAccountButton] Current session:',
        session ? { id: session.user.id, email: session.user.email } : null
      );
      console.log(
        '[AddAccountButton] Existing accounts:',
        accounts.length,
        accounts.map((a) => ({ id: a.id, email: a.metadata.email }))
      );

      if (session) {
        // Check if current session is already in the store
        const currentAccountExists = accounts.some(
          (acc) => acc.id === session.user.id
        );

        console.log(
          '[AddAccountButton] Current account in store?',
          currentAccountExists
        );

        if (!currentAccountExists) {
          // Save current session before navigating away
          console.log(
            '[AddAccountButton] Saving current session before navigating...'
          );
          const result = await addAccount(session, {
            switchImmediately: false,
          });
          console.log('[AddAccountButton] Save result:', result);

          // Wait briefly to ensure localStorage write completes
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      // Navigate to login with multiAccount flag
      const currentPath = window.location.pathname;
      const returnUrl = encodeURIComponent(currentPath);
      console.log(
        '[AddAccountButton] Navigating to login with returnUrl:',
        returnUrl
      );
      window.location.href = `/login?multiAccount=true&returnUrl=${returnUrl}`;
    } catch (error) {
      console.error(
        '[AddAccountButton] Failed to prepare for adding account:',
        error
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
