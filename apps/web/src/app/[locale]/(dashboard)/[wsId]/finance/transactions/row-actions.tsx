'use client';

import { TransactionForm } from './form';
import { Row } from '@tanstack/react-table';
import { Transaction } from '@ncthub/types/primitives/Transaction';
import { Button } from '@ncthub/ui/button';
import ModifiableDialogTrigger from '@ncthub/ui/custom/modifiable-dialog-trigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ncthub/ui/dropdown-menu';
import { toast } from '@ncthub/ui/hooks/use-toast';
import { Ellipsis, Eye } from '@ncthub/ui/icons';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  row: Row<Transaction>;
  href?: string;
}

export function TransactionRowActions(props: Props) {
  const t = useTranslations();

  const router = useRouter();
  const data = props.row.original;

  const deleteTransaction = async () => {
    const res = await fetch(
      `/api/workspaces/${data.ws_id}/transactions/${data.id}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: 'Failed to delete workspace transaction',
        description: data.message,
      });
    }
  };

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (!data.id || !data.ws_id) return null;

  return (
    <div className="flex items-center justify-end gap-2">
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
            className="data-[state=open]:bg-muted flex h-8 w-8 p-0"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
            {t('common.edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={deleteTransaction}>
            {t('common.delete')}
          </DropdownMenuItem>
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
