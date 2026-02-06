'use client';

import { Loader2 } from '@tuturuuu/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type JSX, useState } from 'react';
import { useAccountSwitcher } from '@/context/account-switcher-context';

interface RemoveAccountDialogProps {
  accountId: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RemoveAccountDialog({
  accountId,
  onClose,
  onSuccess,
}: RemoveAccountDialogProps): JSX.Element {
  const t = useTranslations();
  const { accounts, removeAccount } = useAccountSwitcher();
  const [isRemoving, setIsRemoving] = useState(false);

  const account = accounts.find((acc) => acc.id === accountId);

  const handleRemove = async () => {
    if (!accountId) return;

    setIsRemoving(true);
    try {
      const result = await removeAccount(accountId);

      if (result.success) {
        toast.success(t('account_switcher.account_removed_success'));
        onClose();
        onSuccess?.();
      } else {
        toast.error(
          result.error || t('account_switcher.account_removed_error')
        );
      }
    } catch (error) {
      console.error('Failed to remove account:', error);
      toast.error(t('account_switcher.account_removed_error'));
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <AlertDialog open={!!accountId} onOpenChange={() => onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('account_switcher.remove_account_title')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('account_switcher.remove_account_description', {
              account:
                account?.metadata.displayName ||
                account?.email ||
                'this account',
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRemoving}>
            {t('common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRemove}
            disabled={isRemoving}
            className="bg-dynamic-red hover:bg-dynamic-red/90"
          >
            {isRemoving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('account_switcher.remove')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
