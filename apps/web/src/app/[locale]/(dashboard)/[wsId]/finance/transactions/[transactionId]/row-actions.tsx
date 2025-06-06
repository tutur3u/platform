'use client';

import { joinPath } from '@/utils/path-helper';
import { createDynamicClient } from '@ncthub/supabase/next/client';
import { StorageObject } from '@ncthub/types/primitives/StorageObject';
import { Button } from '@ncthub/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ncthub/ui/dropdown-menu';
import { toast } from '@ncthub/ui/hooks/use-toast';
import { Ellipsis } from '@ncthub/ui/icons';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

interface Props {
  wsId: string;
  transactionId: string;
  storageObj: StorageObject;
}

export function TransactionObjectRowActions({
  wsId,
  transactionId,
  storageObj,
}: Props) {
  const supabase = createDynamicClient();
  const t = useTranslations();

  const router = useRouter();

  const deleteStorageObject = async () => {
    if (!storageObj.name) return;

    const { error } = await supabase.storage
      .from('workspaces')
      .remove([
        joinPath(
          wsId,
          'finance',
          'transactions',
          transactionId,
          storageObj.name
        ),
      ]);

    if (!error) {
      router.refresh();
    } else {
      toast({
        title: 'Failed to delete file',
        description: error.message,
      });
    }
  };

  const renameStorageObject = async () => {
    if (!storageObj.name) return;

    const newName = prompt(
      'Enter new name',
      storageObj.name.split(`${wsId}/`)[1]
    );

    if (!newName) return;

    // re-add extension if it was removed
    const safeNewName = storageObj.name.includes('.')
      ? newName.includes('.')
        ? newName
        : `${newName}.${storageObj.name.split('.').pop()}`
      : newName;

    const { error } = await supabase.storage
      .from('workspaces')
      .move(
        joinPath(
          wsId,
          'finance',
          'transactions',
          transactionId,
          storageObj.name
        ),
        joinPath(wsId, 'finance', 'transactions', transactionId, safeNewName)
      );

    if (!error) {
      router.refresh();
    } else {
      toast({
        title: 'Failed to rename file',
        description: error.message,
      });
    }
  };

  const downloadStorageObject = async () => {
    if (!storageObj.name) return;

    const { data, error } = await supabase.storage
      .from('workspaces')
      .download(
        joinPath(
          wsId,
          'finance',
          'transactions',
          transactionId,
          storageObj.name
        )
      );

    if (error) {
      toast({
        title: 'Failed to download file',
        description: error.message,
      });
      return;
    }

    const url = URL.createObjectURL(data);

    const a = document.createElement('a');
    a.href = url;
    a.download = storageObj.name.split(`${wsId}/`).pop() || '';
    a.click();

    URL.revokeObjectURL(url);
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-6 w-6 p-0 data-[state=open]:bg-muted"
            size="xs"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={renameStorageObject}>
            {t('common.rename')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={downloadStorageObject}>
            {t('common.download')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={deleteStorageObject}>
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
