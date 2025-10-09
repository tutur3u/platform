'use client';

import type { Row } from '@tanstack/react-table';
import type { Product } from '@tuturuuu/types/primitives/Product';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { Ellipsis, Eye } from '@tuturuuu/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

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

  const data = row.original;

  if (!data.id || !data.ws_id) return null;

  async function deleteProduct() {
    if (!canDeleteInventory) {
      toast.error(t('ws-roles.inventory_products_access_denied_description'));
      return;
    }

    const res = await fetch(
      `/api/v1/workspaces/${data.ws_id}/products/${data.id}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(
        data.message || t('ws-inventory-products.failed_delete_product')
      );
    }
  }

  return (
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

          {canUpdateInventory && canDeleteInventory && (
            <DropdownMenuSeparator />
          )}
          {canDeleteInventory && (
            <DropdownMenuItem onClick={deleteProduct}>
              {t('common.delete')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
