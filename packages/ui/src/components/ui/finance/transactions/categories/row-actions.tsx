'use client';

import type { Row } from '@tanstack/react-table';
import { ArrowDownCircle, ArrowUpCircle, Ellipsis } from '@tuturuuu/icons';
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
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  getIconComponentByKey,
  type WorkspaceBoardIconKey,
} from '@tuturuuu/ui/custom/icon-picker';
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
import { computeAccessibleLabelStyles } from '@tuturuuu/utils/label-colors';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  row: Row<TransactionCategory>;
}

export function TransactionCategoryRowActions(props: Props) {
  const t = useTranslations();

  const router = useRouter();
  const data = props.row.original;
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteCategory = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/workspaces/${data.ws_id}/transactions/categories/${data.id}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        toast.success(t('ws-transaction-categories.category_deleted'));
        router.refresh();
      } else {
        const errorData = await res.json();
        toast.error(
          errorData.message ||
            t('ws-transaction-categories.failed_to_delete_category')
        );
      }
    } catch {
      toast.error(t('ws-transaction-categories.failed_to_delete_category'));
    } finally {
      setIsDeleting(false);
    }
  };

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (!data.id || !data.ws_id) return null;

  // Get icon component if available
  const IconComponent = data.icon
    ? getIconComponentByKey(data.icon as WorkspaceBoardIconKey)
    : null;

  // Get color styles
  const colorStyles = data.color
    ? computeAccessibleLabelStyles(data.color)
    : null;

  // Determine the icon to show
  const CategoryIcon = IconComponent
    ? IconComponent
    : data.is_expense === false
      ? ArrowUpCircle
      : ArrowDownCircle;

  return (
    <div
      className="flex items-center justify-end gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Category icon badge */}
      <Badge
        variant="outline"
        className="gap-1.5 px-2 py-1"
        style={
          colorStyles
            ? {
                backgroundColor: colorStyles.bg,
                color: colorStyles.text,
                borderColor: colorStyles.border,
              }
            : undefined
        }
      >
        <CategoryIcon className="h-3.5 w-3.5" />
      </Badge>

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
                  {t('ws-transaction-categories.confirm_delete_category')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={deleteCategory}
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
        title={t('ws-transaction-categories.edit')}
        editDescription={t('ws-transaction-categories.edit_description')}
        setOpen={setShowEditDialog}
        form={<TransactionCategoryForm wsId={data.ws_id} data={data} />}
      />
    </div>
  );
}
