'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { Row } from '@tanstack/react-table';
import { Ellipsis, Eye } from '@tuturuuu/icons';
import { deleteTransaction as deleteTransactionWithInternalApi } from '@tuturuuu/internal-api/finance';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
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
import { TransactionForm } from '@tuturuuu/ui/finance/transactions/form';
import { toast } from '@tuturuuu/ui/sonner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { invalidateTransactionMutationQueries } from './query-invalidation';

interface Props {
  row: Row<Transaction>;
  href?: string;
}

export function TransactionRowActions(props: Props) {
  const t = useTranslations();

  const router = useRouter();
  const queryClient = useQueryClient();
  const data = props.row.original;
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteTransaction = async () => {
    if (!data.ws_id || !data.id) return;

    setIsDeleting(true);
    try {
      await deleteTransactionWithInternalApi(data.ws_id, data.id);
      await invalidateTransactionMutationQueries(queryClient, data.ws_id);
      toast.success(t('ws-transactions.transaction_deleted'));
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('ws-transactions.failed_to_delete_transaction')
      );
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
      {data.href && (
        <Link href={data.href}>
          <Button>
            <Eye className="mr-1 h-5 w-5" />
            {t('common.view')}
          </Button>
        </Link>
      )}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">{t('common.open_menu')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
            {t('common.edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
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
                  {t('ws-transactions.confirm_delete_transaction')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={deleteTransaction}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={isDeleting}
                >
                  {isDeleting ? t('common.deleting') : t('common.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>

      <ModifiableDialogTrigger
        data={data}
        open={showEditDialog}
        title={t('ws-transactions.edit')}
        editDescription={t('ws-transactions.edit_description')}
        setOpen={setShowEditDialog}
        form={<TransactionForm wsId={data.ws_id} data={data} />}
      />
    </div>
  );
}
