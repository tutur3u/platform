'use client';

import { Trash } from '@tuturuuu/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface WalletDeleteButtonProps {
  wsId: string;
  walletId: string;
  walletName?: string;
}

export function WalletDeleteButton({
  wsId,
  walletId,
  walletName,
}: WalletDeleteButtonProps) {
  const t = useTranslations();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/workspaces/${wsId}/wallets/${walletId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success(t('ws-wallets.wallet_deleted'));
        setIsOpen(false);
        router.push(`/${wsId}/finance/wallets`);
        router.refresh();
      } else {
        const errorData = await res.json();
        toast.error(
          errorData.message || t('ws-wallets.failed_to_delete_wallet')
        );
      }
    } catch {
      toast.error(t('ws-wallets.failed_to_delete_wallet'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash className="mr-2 h-4 w-4" />
          {t('common.delete')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('common.confirm_delete_title')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {walletName
              ? t('ws-wallets.confirm_delete_wallet_named', {
                  name: walletName,
                })
              : t('ws-wallets.confirm_delete_wallet')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {t('common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isDeleting}
          >
            {isDeleting ? t('common.deleting') : t('common.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
