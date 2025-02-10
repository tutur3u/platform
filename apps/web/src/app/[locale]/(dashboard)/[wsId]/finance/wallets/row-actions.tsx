'use client';

import { WalletForm } from './form';
import { Row } from '@tanstack/react-table';
import { Wallet } from '@tutur3u/types/primitives/Wallet';
import { Button } from '@tutur3u/ui/components/ui/button';
import ModifiableDialogTrigger from '@tutur3u/ui/components/ui/custom/modifiable-dialog-trigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tutur3u/ui/components/ui/dropdown-menu';
import { toast } from '@tutur3u/ui/hooks/use-toast';
import { Ellipsis, Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface WalletRowActionsProps {
  row: Row<Wallet>;
  href?: string;
}

export function WalletRowActions({ row, href }: WalletRowActionsProps) {
  const t = useTranslations();

  const router = useRouter();
  const data = row.original;

  const deleteWallet = async () => {
    const res = await fetch(
      `/api/workspaces/${data.ws_id}/wallets/${data.id}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: 'Failed to delete workspace wallet',
        description: data.message,
      });
    }
  };

  const [showEditDialog, setShowEditDialog] = useState(false);

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
          <DropdownMenuItem onClick={deleteWallet}>
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ModifiableDialogTrigger
        data={data}
        open={showEditDialog}
        title={t('ws-wallets.edit')}
        editDescription={t('ws-wallets.edit_description')}
        setOpen={setShowEditDialog}
        form={<WalletForm wsId={data.ws_id} data={data} />}
      />
    </div>
  );
}
