'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  File,
  HardDrive,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from '@tuturuuu/icons';
import {
  deleteWorkspaceUserGroupStorageFile,
  generateWorkspaceCourseModulesFromStorage,
  listWorkspaceUserGroupStorageFiles,
  uploadWorkspaceUserGroupStorageFile,
} from '@tuturuuu/internal-api';
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
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { formatBytes } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  GroupSectionCard,
  GroupSectionEmpty,
} from './_components/group-section-card';

export type GroupStorageFiles = Awaited<
  ReturnType<typeof listWorkspaceUserGroupStorageFiles>
>;

interface GroupStorageProps {
  wsId: string;
  groupId: string;
  canUpdateGroup: boolean;
  initialFiles?: GroupStorageFiles;
}

export default function GroupStorage({
  wsId,
  groupId,
  canUpdateGroup,
  initialFiles,
}: GroupStorageProps) {
  const t = useTranslations('ws-user-group-details');
  const commonT = useTranslations('common');
  const router = useRouter();
  const queryClient = useQueryClient();

  const queryKey = ['group-storage', wsId, groupId];
  const [open, setOpen] = useState(false);

  const {
    data: files,
    isError,
    isLoading,
  } = useQuery({
    queryKey,
    queryFn: () => listWorkspaceUserGroupStorageFiles(wsId, groupId),
    initialData: initialFiles,
    staleTime: 60 * 1000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (filesToUpload: StatedFile[]) => {
      for (const file of filesToUpload) {
        await uploadWorkspaceUserGroupStorageFile(wsId, groupId, file.rawFile);
      }
    },
    onSuccess: () => {
      toast.success(commonT('success'));
      setOpen(false);
    },
    onError: () => {
      toast.error(commonT('error'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleUpload = async (filesToUpload: StatedFile[]) => {
    await uploadMutation.mutateAsync(filesToUpload).catch(() => undefined);
  };

  const deleteMutation = useMutation({
    mutationFn: (filename: string) =>
      deleteWorkspaceUserGroupStorageFile(wsId, groupId, filename),
    onSuccess: () => {
      toast.success(commonT('success'));
      queryClient.invalidateQueries({ queryKey });
    },
    onError: () => {
      toast.error(commonT('error'));
    },
  });

  const generateModuleMutation = useMutation({
    mutationFn: (filename: string) =>
      generateWorkspaceCourseModulesFromStorage(wsId, {
        groupId,
        storagePath: `user-groups/${groupId}/${filename}`,
        fileName: filename,
      }),
    onSuccess: (data) => {
      toast.success(t('generate_module_success'));
      const firstModuleId = data.createdModules?.[0]?.id;
      if (firstModuleId) {
        router.push(
          `/${wsId}/education/courses/${groupId}/modules/${firstModuleId}/content`
        );
      } else {
        router.refresh();
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : t('generate_module_error')
      );
    },
  });

  return (
    <GroupSectionCard
      accent="orange"
      icon={<HardDrive className="h-5 w-5" />}
      title={t('storage') || 'Storage'}
      description={files?.length ? `${files.length}` : undefined}
      action={
        canUpdateGroup ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-2">
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
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="grid gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton
              key={`storage-skel-${i}`}
              className="h-14 w-full rounded-lg"
            />
          ))}
        </div>
      ) : isError ? (
        <GroupSectionEmpty>
          <span className="text-dynamic-red">{t('error_loading_files')}</span>
        </GroupSectionEmpty>
      ) : files?.length ? (
        <div className="grid gap-2">
          {files.map((file) => (
            <div
              key={file.id || file.name}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/50 bg-card/40 p-3 transition-all duration-200 hover:border-border hover:bg-card/80 hover:shadow-sm"
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
                    aria-label={t('generate_module_with_ai')}
                    title={t('generate_module_with_ai')}
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
                    disabled={
                      deleteMutation.isPending &&
                      deleteMutation.variables === file.name
                    }
                    aria-label={commonT('delete')}
                  >
                    {deleteMutation.isPending &&
                    deleteMutation.variables === file.name ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <GroupSectionEmpty icon={<HardDrive className="h-8 w-8" />}>
          {t('no_files') || 'No files uploaded yet.'}
        </GroupSectionEmpty>
      )}
    </GroupSectionCard>
  );
}
