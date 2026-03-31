'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { Row } from '@tanstack/react-table';
import { Archive, Ellipsis, Eye, RotateCcw } from '@tuturuuu/icons';
import type { Product } from '@tuturuuu/types/primitives/Product';
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
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ProductDeleteDialog } from './quick-dialog-components/ProductDeleteDialog';

interface ProductRowActionsProps {
  row: Row<Product>;
  href?: string;
  canUpdateInventory?: boolean;
  canDeleteInventory?: boolean;
}

export function ProductRowActions({
  row,
  href,
  canUpdateInventory = false,
  canDeleteInventory = false,
}: ProductRowActionsProps) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const data = row.original;
  const isArchived = data.archived === true;
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!data.id || !data.ws_id) return null;

  async function toggleArchiveProduct() {
    if (!canUpdateInventory) {
      toast.error(t('ws-roles.inventory_products_access_denied_description'));
      return;
    }

    setIsArchiving(true);

    try {
      const res = await fetch(
        `/api/v1/workspaces/${data.ws_id}/products/${data.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: !isArchived }),
        }
      );

      if (res.ok) {
        toast.success(
          isArchived
            ? t('ws-inventory-products.messages.product_restored_successfully')
            : t('ws-inventory-products.messages.product_archived_successfully')
        );
        queryClient.invalidateQueries({
          queryKey: ['workspace-products', data.ws_id],
        });
        queryClient.invalidateQueries({
          queryKey: ['workspace-product', data.ws_id, data.id],
        });
        router.refresh();
      } else {
        const resData = await res.json();
        toast.error(
          resData.message ||
            t('ws-inventory-products.messages.failed_archive_product')
        );
      }
    } catch (_error) {
      toast.error(t('ws-inventory-products.messages.failed_archive_product'));
    } finally {
      setIsArchiving(false);
      setShowArchiveDialog(false);
    }
  }

  async function deleteProduct() {
    if (!canDeleteInventory) {
      toast.error(t('ws-roles.inventory_products_access_denied_description'));
      return;
    }

    setIsDeleting(true);

    try {
      const res = await fetch(
        `/api/v1/workspaces/${data.ws_id}/products/${data.id}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        toast.success(
          t('ws-inventory-products.messages.product_deleted_successfully')
        );
        queryClient.invalidateQueries({
          queryKey: ['workspace-products', data.ws_id],
        });
        router.refresh();
      } else {
        const resData = await res.json();
        toast.error(
          resData.message || t('ws-inventory-products.failed_delete_product')
        );
      }
    } catch (_error) {
      toast.error(t('ws-inventory-products.failed_delete_product'));
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {href && (
          <Link href={href} onClick={(e) => e.stopPropagation()}>
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
              onClick={(e) => e.stopPropagation()}
            >
              <Ellipsis className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[160px]">
            {canUpdateInventory && (
              <DropdownMenuItem asChild>
                <Link href={`./products/${data.id}`}>{t('common.edit')}</Link>
              </DropdownMenuItem>
            )}

            {canUpdateInventory && (
              <DropdownMenuItem onClick={() => setShowArchiveDialog(true)}>
                {isArchived ? (
                  <RotateCcw className="mr-2 h-4 w-4" />
                ) : (
                  <Archive className="mr-2 h-4 w-4" />
                )}
                {isArchived ? t('common.restore') : t('common.archive')}
              </DropdownMenuItem>
            )}

            {canUpdateInventory && canDeleteInventory && (
              <DropdownMenuSeparator />
            )}
            {canDeleteInventory && (
              <DropdownMenuItem onClick={() => setShowDeleteDialog(true)}>
                {t('common.delete')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isArchived
                ? t('ws-inventory-products.messages.restore_product_title')
                : t('ws-inventory-products.messages.archive_product_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isArchived
                ? t('ws-inventory-products.messages.restore_confirmation', {
                    name: data.name || '',
                  })
                : t('ws-inventory-products.messages.archive_confirmation', {
                    name: data.name || '',
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isArchiving}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void toggleArchiveProduct();
              }}
              disabled={isArchiving}
            >
              {isArchived ? t('common.restore') : t('common.archive')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProductDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={deleteProduct}
        isDeleting={isDeleting}
        productName={data.name || ''}
      />
    </>
  );
}
