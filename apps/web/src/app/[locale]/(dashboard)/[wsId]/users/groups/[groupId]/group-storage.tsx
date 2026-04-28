'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Loader2, Trash2, Upload } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  FileUploader,
  type StatedFile,
} from '@tuturuuu/ui/custom/file-uploader';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { formatBytes } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface GroupStorageProps {
  wsId: string;
  groupId: string;
  canUpdateGroup: boolean;
}

export default function GroupStorage({
  wsId,
  groupId,
  canUpdateGroup,
}: GroupStorageProps) {
  const t = useTranslations('ws-user-group-details');
  const commonT = useTranslations('common');
  const queryClient = useQueryClient();

  const queryKey = ['group-storage', wsId, groupId];
  const [open, setOpen] = useState(false);

  const { data: files, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/storage`
      );
      if (!res.ok) throw new Error('Failed to fetch group storage');
      const payload = await res.json();
      return payload.data as any[];
    },
  });

  const handleUpload = async (filesToUpload: StatedFile[]) => {
    try {
      for (const file of filesToUpload) {
        const res = await fetch(
          `/api/v1/workspaces/${wsId}/user-groups/${groupId}/storage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: file.rawFile.name,
              size: file.rawFile.size,
            }),
          }
        );

        if (!res.ok) throw new Error('Failed to get upload URL');
        const { signedUrl, token } = await res.json();

        const formData = new FormData();
        formData.append('file', file.rawFile);
        if (token) formData.append('token', token);

        const uploadRes = await fetch(signedUrl, {
          method: 'PUT',
          body: formData,
        });

        if (!uploadRes.ok) throw new Error('Failed to upload file');

        if (token) {
          await fetch(`/api/v1/workspaces/${wsId}/storage/finalize-upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
        }
      }
      toast.success(commonT('success'));
      queryClient.invalidateQueries({ queryKey });
      setOpen(false);
    } catch {
      toast.error(commonT('error'));
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (filename: string) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/storage?filename=${encodeURIComponent(
          filename
        )}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Failed to delete file');
    },
    onSuccess: () => {
      toast.success(commonT('success'));
      queryClient.invalidateQueries({ queryKey });
    },
    onError: () => {
      toast.error(commonT('error'));
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-lg">{t('storage') || 'Storage'}</div>

        {canUpdateGroup && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Upload className="h-4 w-4" />
                {commonT('upload') || 'Upload Files'}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{commonT('upload') || 'Upload Files'}</DialogTitle>
              </DialogHeader>
              <FileUploader
                onUpload={handleUpload}
                multiple
                maxFileCount={10}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-2">
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : files?.length ? (
          files.map((file) => (
            <div
              key={file.id || file.name}
              className="flex items-center justify-between rounded-lg border border-border/50 bg-card/50 p-3 backdrop-blur-sm transition-all duration-200 hover:border-border hover:bg-card/80 hover:shadow-black/5 hover:shadow-sm"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <File className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{file.name}</p>
                  {file.metadata?.size !== undefined && (
                    <p className="text-muted-foreground text-xs">
                      {formatBytes(file.metadata.size)}
                    </p>
                  )}
                </div>
              </div>
              {canUpdateGroup && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => deleteMutation.mutate(file.name || '')}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          ))
        ) : (
          <div className="py-4 text-center text-muted-foreground text-sm">
            {t('no_files') || 'No files uploaded yet.'}
          </div>
        )}
      </div>
    </div>
  );
}
