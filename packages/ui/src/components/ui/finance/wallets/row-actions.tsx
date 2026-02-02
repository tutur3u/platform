'use client';

import type { Row } from '@tanstack/react-table';
import { Ellipsis, Eye } from '@tuturuuu/icons';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
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
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { WalletForm } from '@tuturuuu/ui/finance/wallets/form';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from '../../sonner';

interface WalletRowActionsProps {
  row: Row<Wallet>;
  href?: string;
  canUpdateWallets?: boolean;
  canDeleteWallets?: boolean;
  isPersonalWorkspace?: boolean;
}

export function WalletRowActions({
  row,
  href,
  canUpdateWallets,
  canDeleteWallets,
  isPersonalWorkspace,
}: WalletRowActionsProps) {
  const t = useTranslations();

  const router = useRouter();
  const data = row.original;
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteWallet = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/workspaces/${data.ws_id}/wallets/${data.id}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        toast.success(t('ws-wallets.wallet_deleted'));
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

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (!data.id || !data.ws_id) return null;

  return (
    <div
      className="flex items-center justify-end gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      {href && (
        <Link href={href}>
          <Button>
            <Eye className="mr-1 h-5 w-5" />
            {t('common.view')}
          </Button>
        </Link>
      )}
      {(canUpdateWallets || canDeleteWallets) && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
            >
              <Ellipsis className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {canUpdateWallets && (
              <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                {t('common.edit')}
              </DropdownMenuItem>
            )}
            {canUpdateWallets && canDeleteWallets && <DropdownMenuSeparator />}
            {canDeleteWallets && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    disabled={isDeleting}
                  >
                    {t('common.delete')}
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t('common.confirm_delete_title')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('ws-wallets.confirm_delete_wallet')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={deleteWallet}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={isDeleting}
                    >
                      {isDeleting ? t('common.deleting') : t('common.delete')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ModifiableDialogTrigger
        data={data}
        open={showEditDialog}
        title={t('ws-wallets.edit')}
        editDescription={t('ws-wallets.edit_description')}
        setOpen={setShowEditDialog}
        form={
          <WalletForm
            wsId={data.ws_id}
            data={data}
            isPersonalWorkspace={isPersonalWorkspace}
          />
        }
        requireExpansion={!isPersonalWorkspace}
      />
    </div>
  );
}
