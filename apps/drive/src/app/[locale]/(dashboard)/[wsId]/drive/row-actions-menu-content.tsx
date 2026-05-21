'use client';

import {
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  PackageOpen,
  Share,
  Trash,
} from '@tuturuuu/icons';
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from '@tuturuuu/ui/context-menu';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';

interface RowActionsMenuContentProps {
  contextMenu: boolean;
  exportFolderPath: string | null;
  isFile: boolean;
  onCopyPath: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onExportFolder: () => void;
  onOpenExternal: () => void;
  onPreview: () => void;
  onRename: () => void;
  onShare: () => void;
}

export function RowActionsMenuContent({
  contextMenu,
  exportFolderPath,
  isFile,
  onCopyPath,
  onDelete,
  onDownload,
  onExportFolder,
  onOpenExternal,
  onPreview,
  onRename,
  onShare,
}: RowActionsMenuContentProps) {
  const t = useTranslations();
  const Item = contextMenu ? ContextMenuItem : DropdownMenuItem;
  const Separator = contextMenu ? ContextMenuSeparator : DropdownMenuSeparator;

  return (
    <>
      {isFile ? (
        <>
          <Item onClick={onPreview}>
            <Eye className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.preview')}
          </Item>
          <Item onClick={onOpenExternal}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {t('common.view')}
          </Item>
          <Separator />
        </>
      ) : null}
      <Item onClick={onRename}>
        <Edit3 className="mr-2 h-4 w-4" />
        {t('common.rename')}
      </Item>
      {isFile ? (
        <>
          <Item
            onClick={(event) => {
              event.stopPropagation();
              onCopyPath();
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.copy_path')}
          </Item>
          <Item onClick={onShare}>
            <Share className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.share')}
          </Item>
          <Separator />
          <Item onClick={onDownload}>
            <Download className="mr-2 h-4 w-4" />
            {t('common.download')}
          </Item>
          <Separator />
        </>
      ) : null}
      {!isFile && exportFolderPath ? (
        <>
          <Item onClick={onExportFolder}>
            <PackageOpen className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.export.folder_action')}
          </Item>
          <Separator />
        </>
      ) : null}
      <Item onClick={onDelete}>
        <Trash className="mr-2 h-4 w-4" />
        {t('common.delete')}
      </Item>
    </>
  );
}
