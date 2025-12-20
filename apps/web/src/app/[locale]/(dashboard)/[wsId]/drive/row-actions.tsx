'use client';

import type { Row } from '@tanstack/react-table';
import {
  Copy,
  Download,
  Edit3,
  Ellipsis,
  ExternalLink,
  Eye,
  Share,
  Trash,
} from '@tuturuuu/icons';
import { createDynamicClient } from '@tuturuuu/supabase/next/client';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Button } from '@tuturuuu/ui/button';
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from '@tuturuuu/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { joinPath } from '@/utils/path-helper';

interface Props {
  wsId: string;
  row: Row<StorageObject>;
  path?: string;
  setStorageObject: (value: StorageObject | undefined) => void;
  menuOnly?: boolean;
  contextMenu?: boolean;
  onRequestDelete?: (obj: StorageObject) => void;
}

export function StorageObjectRowActions({
  wsId,
  row,
  path = '',
  setStorageObject,
  menuOnly = false,
  contextMenu = false,
  onRequestDelete,
}: Props) {
  const supabase = createDynamicClient();
  const t = useTranslations();
  const router = useRouter();
  const storageObj = row.original;

  const previewFile = () => {
    if (storageObj) {
      setStorageObject(storageObj);
    }
  };

  const copyPath = async () => {
    if (!storageObj.name) return;

    const fullPath = joinPath(wsId, path, storageObj.name);
    try {
      await navigator.clipboard.writeText(fullPath);
      toast({
        title: t('common.success'),
        description: t('ws-storage-objects.path_copied'),
      });
    } catch (_error) {
      toast({
        title: t('common.error'),
        description: 'Failed to copy',
        variant: 'destructive',
      });
    }
  };

  const shareFile = async () => {
    if (!storageObj.name) return;

    try {
      const { data, error } = await supabase.storage
        .from('workspaces')
        .createSignedUrl(joinPath(wsId, path, storageObj.name), 3600);

      if (error) throw error;

      await navigator.clipboard.writeText(data.signedUrl);
      toast({
        title: t('common.success'),
        description: t('ws-storage-objects.share_link_copied'),
      });
    } catch (_error) {
      toast({
        title: t('common.error'),
        description: t('ws-storage-objects.share_failed'),
        variant: 'destructive',
      });
    }
  };

  const openExternal = async () => {
    if (!storageObj.name) return;

    try {
      const { data, error } = await supabase.storage
        .from('workspaces')
        .createSignedUrl(storageObj.name, 3600);

      if (error) throw error;

      window.open(data.signedUrl, '_blank');
    } catch (_error) {
      toast({
        title: t('common.error'),
        description: t('ws-storage-objects.open_failed'),
        variant: 'destructive',
      });
    }
  };

  const renameStorageObject = async () => {
    if (!storageObj.name) return;

    const currentName =
      storageObj.name.split(`${wsId}/`).pop() || storageObj.name;
    const newName = prompt(t('ws-storage-objects.enter_new_name'), currentName);

    if (!newName || newName === currentName) return;

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
      toast({
        title: t('common.success'),
        description: t('ws-storage-objects.file_renamed'),
      });
    } else {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const renameStorageFolder = async () => {
    if (!storageObj.name) return;

    const currentName =
      storageObj.name.split(`${wsId}/`).pop() || storageObj.name;
    const newName = prompt(
      t('ws-storage-objects.enter_new_folder_name'),
      currentName
    );

    if (!newName || newName === currentName) return;

    // get all inside contents using query
    const { data, error } = await supabase
      .schema('storage')
      .from('objects')
      .select()
      .ilike('name', joinPath(wsId, path, storageObj.name, '%'));

    if (error) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    for (const object of data) {
      const source = object.name;
      const destination = source.replace(
        joinPath(wsId, path, storageObj.name),
        joinPath(wsId, path, newName)
      );

      // try to move everything from old folder to new folder
      const { error } = await supabase.storage
        .from('workspaces')
        .move(source, destination);

      // prompt in case of error, continue otherwise
      if (error) {
        toast({
          title: t('common.error'),
          description: `${t('ws-storage-objects.move_failed')}: ${source} to ${destination}`,
          variant: 'destructive',
        });
      }
    }

    // refresh on complete
    router.refresh();
    toast({
      title: t('common.success'),
      description: t('ws-storage-objects.folder_renamed'),
    });
  };

  const downloadStorageObject = async () => {
    if (!storageObj.name) return;

    try {
      const { data, error } = await supabase.storage
        .from('workspaces')
        .download(joinPath(wsId, path, storageObj.name));

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = storageObj.name.split(`${wsId}/`).pop() || '';
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: t('common.success'),
        description: t('ws-storage-objects.download_started'),
      });
    } catch (_error) {
      toast({
        title: t('common.error'),
        description: t('ws-storage-objects.download_failed'),
        variant: 'destructive',
      });
    }
  };

  const menuContent = contextMenu ? (
    <>
      {storageObj.id && (
        <>
          <ContextMenuItem onClick={previewFile}>
            <Eye className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.preview')}
          </ContextMenuItem>
          <ContextMenuItem onClick={openExternal}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {t('common.view')}
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      <ContextMenuItem
        onClick={storageObj.id ? renameStorageObject : renameStorageFolder}
      >
        <Edit3 className="mr-2 h-4 w-4" />
        {t('common.rename')}
      </ContextMenuItem>
      {storageObj.id && (
        <>
          <ContextMenuItem
            onClick={(e) => {
              e.stopPropagation();
              copyPath();
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.copy_path')}
          </ContextMenuItem>
          <ContextMenuItem onClick={shareFile}>
            <Share className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.share')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={downloadStorageObject}>
            <Download className="mr-2 h-4 w-4" />
            {t('common.download')}
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      <ContextMenuItem onClick={() => onRequestDelete?.(storageObj)}>
        <Trash className="mr-2 h-4 w-4" />
        {t('common.delete')}
      </ContextMenuItem>
    </>
  ) : (
    <>
      {storageObj.id && (
        <>
          <DropdownMenuItem onClick={previewFile}>
            <Eye className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.preview')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openExternal}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {t('common.view')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuItem
        onClick={storageObj.id ? renameStorageObject : renameStorageFolder}
      >
        <Edit3 className="mr-2 h-4 w-4" />
        {t('common.rename')}
      </DropdownMenuItem>
      {storageObj.id && (
        <>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              copyPath();
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.copy_path')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={shareFile}>
            <Share className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.share')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={downloadStorageObject}>
            <Download className="mr-2 h-4 w-4" />
            {t('common.download')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuItem onClick={() => onRequestDelete?.(storageObj)}>
        <Trash className="mr-2 h-4 w-4" />
        {t('common.delete')}
      </DropdownMenuItem>
    </>
  );

  if (menuOnly) {
    return menuContent;
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Ellipsis className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[180px]">
        {menuContent}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
