'use client';

import { describeWebAccountSaveError } from '@tuturuuu/internal-api/auth';
import { Plus } from '@tuturuuu/icons/lucide-static';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
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
      const result = await prepareAddAccountAndNavigate({
        saveCurrentAccount: addAccount,
      });

      if (result.errorCode === 'account_limit') {
        toast.error(describeWebAccountSaveError(result, t));
        setIsLoading(false);
      }
    } catch {
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
