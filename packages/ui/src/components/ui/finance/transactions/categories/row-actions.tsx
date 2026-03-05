'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Row } from '@tanstack/react-table';
import { Ellipsis } from '@tuturuuu/icons';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
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
import { TransactionCategoryForm } from '@tuturuuu/ui/finance/transactions/categories/form';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  row: Row<TransactionCategory>;
}

export function TransactionCategoryRowActions(props: Props) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const data = props.row.original;
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/workspaces/${data.ws_id}/transactions/categories/${data.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        let message = t('ws-transaction-categories.failed_to_delete_category');
        try {
          const errorData = (await response.json()) as { message?: string };
          if (errorData.message) {
            message = errorData.message;
          }
        } catch {
          // Keep fallback error message.
        }
        throw new Error(message);
      }
    },
    onSuccess: async () => {
      toast.success(t('ws-transaction-categories.category_deleted'));
      await queryClient.invalidateQueries({
        queryKey: ['transaction-categories', data.ws_id],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (!data.id || !data.ws_id) return null;

  return (
    <div
      className="flex items-center justify-end"
      onClick={(e) => e.stopPropagation()}
    >
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
          <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
            {t('common.edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                disabled={deleteMutation.isPending}
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
                  {t('ws-transaction-categories.confirm_delete_category')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending
                    ? t('common.deleting')
                    : t('common.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>

      <ModifiableDialogTrigger
        data={data}
        open={showEditDialog}
        title={t('ws-transaction-categories.edit')}
        editDescription={t('ws-transaction-categories.edit_description')}
        setOpen={setShowEditDialog}
        form={<TransactionCategoryForm wsId={data.ws_id} data={data} />}
      />
    </div>
  );
}
