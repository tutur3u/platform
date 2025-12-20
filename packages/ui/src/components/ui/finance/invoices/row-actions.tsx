'use client';

import type { Row } from '@tanstack/react-table';
import { Ellipsis, Eye } from '@tuturuuu/icons';
import type { Invoice } from '@tuturuuu/types/primitives/Invoice';
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

interface InvoiceRowActionsProps {
  row: Row<Invoice>;
  href?: string;
  canDeleteInvoices?: boolean;
}

export function InvoiceRowActions({
  row,
  href,
  canDeleteInvoices = false,
}: InvoiceRowActionsProps) {
  const t = useTranslations();

  const router = useRouter();
  const data = row.original;

  const deleteInvoice = async () => {
    if (!canDeleteInvoices) {
      toast.error(t('common.insufficient_permissions'));
      return;
    }

    const res = await fetch(
      `/api/workspaces/${data.ws_id}/invoices/${data.id}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.message || t('ws-invoices.failed_delete_invoice'));
    }
  };

  if (!data.id || !data.ws_id) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      {href && (
        <Link href={href}>
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
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={deleteInvoice}
            disabled={!canDeleteInvoices}
          >
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
