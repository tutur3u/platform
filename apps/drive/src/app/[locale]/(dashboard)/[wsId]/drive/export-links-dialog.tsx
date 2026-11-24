'use client';

import { PackageOpen } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ExportLinksDialogContent } from './export-links-dialog-content';

interface WorkspaceStorageExportLinksDialogProps {
  wsId: string;
  folderPath: string;
  folderName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkspaceStorageExportLinksDialog({
  wsId,
  folderPath,
  folderName,
  open,
  onOpenChange,
}: WorkspaceStorageExportLinksDialogProps) {
  const t = useTranslations('ws-storage-objects.export');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description', { folderName })}
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <ExportLinksDialogContent folderPath={folderPath} wsId={wsId} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface WorkspaceStorageExportLinksButtonProps {
  wsId: string;
  folderPath: string;
  folderName: string;
}

export function WorkspaceStorageExportLinksButton({
  wsId,
  folderPath,
  folderName,
}: WorkspaceStorageExportLinksButtonProps) {
  const t = useTranslations('ws-storage-objects.export');
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <PackageOpen className="size-4" />
        {t('button')}
      </Button>
      <WorkspaceStorageExportLinksDialog
        wsId={wsId}
        folderPath={folderPath}
        folderName={folderName}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
