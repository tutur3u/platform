'use client';

import { StorageObject } from '@/types/primitives/StorageObject';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@repo/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/ui/dropdown-menu';
import { toast } from '@repo/ui/hooks/use-toast';
import { Row } from '@tanstack/react-table';
import { Ellipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

interface Props {
  wsId: string;
  row: Row<StorageObject>;
  // eslint-disable-next-line no-unused-vars
  setStorageObject: (value: StorageObject | undefined) => void;
}

export function StorageObjectRowActions(props: Props) {
  const supabase = createClient();
  const t = useTranslations();

  const router = useRouter();
  const storageObj = props.row.original;

  const deleteStorageObject = async () => {
    if (!storageObj.name) return;

    const { error } = await supabase.storage
      .from('workspaces')
      .remove([`${props.wsId}/${storageObj.name}`]);

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
      storageObj.name.split(`${props.wsId}/`)[1]
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
      .move(`${props.wsId}/${storageObj.name}`, `${props.wsId}/${safeNewName}`);

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
      .download(`${props.wsId}/${storageObj.name}`);

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
    a.download = storageObj.name.split(`${props.wsId}/`).pop() || '';
    a.click();

    URL.revokeObjectURL(url);
  };

  if (!storageObj.id) return null;

  return (
    <>
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
