'use client';

import { Plus } from '@tuturuuu/icons/lucide-static';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAccountSwitcher } from '@/context/account-switcher-context';
import { prepareAddAccountAndNavigate } from './utils';

export function AddAccountButton() {
  const t = useTranslations();
  const { addAccount } = useAccountSwitcher();
  const [isLoading, setIsLoading] = useState(false);

  const handleAddAccount = async () => {
    setIsLoading(true);
    try {
      await prepareAddAccountAndNavigate({
        saveCurrentAccount: addAccount,
      });
    } catch (_error) {
      // prepareAddAccountAndNavigate handles navigation even on error,
      // but reset loading state in case navigation was prevented
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
