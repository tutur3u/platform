'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Loader2, Sparkles, Trash2, Upload } from '@tuturuuu/icons';
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
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
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

  const generateModuleMutation = useMutation({
    mutationFn: async (filename: string) => {
      const res = await fetch('/api/ai/course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wsId,
          groupId,
          storagePath: `${wsId}/user-groups/${groupId}/${filename}`,
          fileName: filename,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error || errorData.message || 'Failed to generate module'
        );
      }

      return res.json();
    },
    onSuccess: (data) => {
      toast.success('Course module generated successfully!');
      if (data.createdModule?.id) {
        // Redirect to the content editor for the new module
        router.push(`/${wsId}/education/courses/${groupId}/modules/${data.createdModule.id}/content`);
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Error generating module'
      );
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
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/50 bg-card/50 p-3 backdrop-blur-sm transition-all duration-200 hover:border-border hover:bg-card/80 hover:shadow-black/5 hover:shadow-sm"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <File className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-col">
                  <p className="truncate font-medium text-sm" title={file.name}>
                    {file.name}
                  </p>
                  {file.metadata?.size !== undefined && (
                    <p className="text-muted-foreground text-xs">
                      {formatBytes(file.metadata.size)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                {canUpdateGroup && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0 text-dynamic-purple hover:bg-dynamic-purple/10 hover:text-dynamic-purple"
                    onClick={() =>
                      generateModuleMutation.mutate(file.name || '')
                    }
                    disabled={
                      generateModuleMutation.isPending &&
                      generateModuleMutation.variables === file.name
                    }
                    title="Generate Course Module with AI"
                  >
                    {generateModuleMutation.isPending &&
                    generateModuleMutation.variables === file.name ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                )}
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
