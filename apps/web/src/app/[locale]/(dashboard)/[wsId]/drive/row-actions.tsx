'use client';

import { StorageObject } from '@/types/primitives/StorageObject';
import { joinPath } from '@/utils/path-helper';
import { createDynamicClient } from '@/utils/supabase/client';
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
  path?: string;
  // eslint-disable-next-line no-unused-vars
  setStorageObject: (value: StorageObject | undefined) => void;
}

export function StorageObjectRowActions({ wsId, row, path = '' }: Props) {
  const supabase = createDynamicClient();
  const t = useTranslations();

  const router = useRouter();
  const storageObj = row.original;

  const deleteStorageObject = async () => {
    if (!storageObj.name) return;

    const { error } = await supabase.storage
      .from('workspaces')
      .remove([joinPath(wsId, path, storageObj.name)]);

    if (!error) {
      router.refresh();
    } else {
      toast({
        title: 'Failed to delete file',
        description: error.message,
      });
    }
  };

  const deleteStorageFolder = async () => {
    if (!storageObj.name) return;

    // get all inside contents using query
    const objects = await supabase
      .schema('storage')
      .from('objects')
      .select()
      .ilike('name', joinPath(wsId, path, storageObj.name, '%'));

    if (objects.error) {
      toast({
        title: 'Failed to get folder files',
        description: objects.error.message,
      });
      return;
    }

    const { error } = await supabase.storage
      .from('workspaces')
      .remove(objects.data.map((object) => object.name));

    if (!error) {
      router.refresh();
    } else {
      toast({
        title: 'Failed to delete files from folder',
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
        joinPath(wsId, path, storageObj.name),
        joinPath(wsId, path, safeNewName)
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
      .download(joinPath(wsId, path, storageObj.name));

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
            className="data-[state=open]:bg-muted flex h-8 w-8 p-0"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          {storageObj.id && (
            // only allows rename & download on onject
            <>
              <DropdownMenuItem onClick={renameStorageObject}>
                {t('common.rename')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={downloadStorageObject}>
                {t('common.download')}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={storageObj.id ? deleteStorageObject : deleteStorageFolder}
          >
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
