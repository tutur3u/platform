'use client';

import { PackageOpen } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
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
      <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-5xl">
        <div className="border-b bg-linear-to-br from-dynamic-blue/8 via-dynamic-cyan/8 to-dynamic-green/8 p-6">
          <DialogHeader className="gap-3 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-dynamic-border bg-background/80 shadow-sm">
                <PackageOpen className="h-5 w-5 text-dynamic-blue" />
              </div>
              <div className="space-y-1">
                <DialogTitle className="flex items-center gap-2">
                  {t('title')}
                  <Badge className="border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/10">
                    {t('rotating_badge')}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {t('description', {
                    folderName,
                  })}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-6 overflow-hidden p-6">
          {open ? (
            <ExportLinksDialogContent folderPath={folderPath} wsId={wsId} />
          ) : null}
        </div>
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
        className="gap-2 border-dynamic-blue/20 bg-dynamic-blue/5 text-dynamic-blue hover:bg-dynamic-blue/10"
        onClick={() => setOpen(true)}
      >
        <PackageOpen className="h-4 w-4" />
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
