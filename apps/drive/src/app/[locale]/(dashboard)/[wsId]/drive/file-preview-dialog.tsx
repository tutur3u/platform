'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, ExternalLink } from '@tuturuuu/icons';
import { createWorkspaceStorageSignedUrl } from '@tuturuuu/internal-api';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Separator } from '@tuturuuu/ui/separator';
import { formatBytes } from '@tuturuuu/utils/format';
import { joinPath } from '@tuturuuu/utils/path-helper';
import { useTranslations } from 'next-intl';
import { FilePreviewRenderer } from './file-preview-renderer';
import { getFileIcon, getFileType } from './file-preview-utils';
import { getStorageObjectDisplayName } from './storage-display-name';

interface FilePreviewDialogProps {
  wsId: string;
  path: string;
  file: StorageObject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FilePreviewDialog({
  wsId,
  path,
  file,
  open,
  onOpenChange,
}: FilePreviewDialogProps) {
  const t = useTranslations();
  const fileType = file?.name ? getFileType(file.name) : 'other';
  const cleanFileName = getStorageObjectDisplayName(file);
  const relativePath = file?.name ? joinPath(path, file.name) : '';
  const signedUrlQuery = useQuery({
    queryKey: ['drive-file-preview-url', wsId, relativePath],
    queryFn: async () => {
      if (!relativePath) throw new Error('Missing file path');
      return createWorkspaceStorageSignedUrl(wsId, relativePath, 3600);
    },
    enabled: open && !!relativePath,
    staleTime: 50 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
  const textContentQuery = useQuery({
    queryKey: ['drive-file-preview-text', signedUrlQuery.data],
    queryFn: async () => {
      if (!signedUrlQuery.data) throw new Error('Missing signed URL');
      const response = await fetch(signedUrlQuery.data, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load file preview');
      return response.text();
    },
    enabled:
      open &&
      !!signedUrlQuery.data &&
      (fileType === 'text' || fileType === 'code'),
    retry: 1,
  });
  const signedUrl = signedUrlQuery.data ?? null;
  const loading =
    signedUrlQuery.isPending ||
    ((fileType === 'text' || fileType === 'code') &&
      textContentQuery.isPending);

  const handleDownload = async () => {
    if (!file?.name || !signedUrl) return;

    try {
      const response = await fetch(signedUrl, { cache: 'no-store' });
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = cleanFileName || file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Success', description: 'File downloaded successfully' });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to download file',
        variant: 'destructive',
      });
    }
  };
  const handleOpenExternal = () => {
    if (signedUrl) window.open(signedUrl, '_blank');
  };

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[90vh] w-full !sm:max-w-6xl max-w-[90vw]! flex-col overflow-y-auto"
        showCloseButton={false}
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="text-dynamic-blue">{getFileIcon(fileType)}</div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-left">
                  {cleanFileName}
                </DialogTitle>
                <DialogDescription className="text-left">
                  {file.metadata?.size ? (
                    <span className="text-muted-foreground">
                      {formatBytes(file.metadata.size)} /{' '}
                      {fileType.toUpperCase()}
                    </span>
                  ) : null}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleDownload}
                variant="outline"
                size="sm"
                disabled={!signedUrl || loading}
              >
                <Download className="mr-2 h-4 w-4" />
                {t('common.download')}
              </Button>
              <Button
                onClick={handleOpenExternal}
                variant="outline"
                size="sm"
                disabled={!signedUrl || loading}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {t('common.view')}
              </Button>
            </div>
          </div>
        </DialogHeader>
        <Separator />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
          <FilePreviewRenderer
            cleanFileName={cleanFileName}
            fileType={fileType}
            loading={loading}
            signedUrl={signedUrl}
            textContent={textContentQuery.data ?? ''}
            onDownload={handleDownload}
            onOpenExternal={handleOpenExternal}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
