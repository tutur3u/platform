'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Loader2, Trash2 } from '@tuturuuu/icons';
import {
  createWorkspaceAvatarUploadTarget,
  deleteWorkspaceAvatar,
  updateWorkspaceAvatar,
  uploadWorkspaceAvatarFile,
} from '@tuturuuu/internal-api';
import type { Workspace } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function WorkspaceAvatarEditor({
  canEdit,
  workspace,
}: {
  canEdit: boolean;
  workspace: Workspace;
}) {
  const t = useTranslations('satellite-workspace-settings');
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const localPreviewRef = useRef<string | undefined>(undefined);
  const [preview, setPreview] = useState(workspace.avatar_url ?? null);

  useEffect(() => {
    setPreview(workspace.avatar_url ?? null);
  }, [workspace.avatar_url]);

  useEffect(
    () => () => {
      if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    },
    []
  );

  const refreshWorkspace = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['workspace', workspace.id],
    });
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith('image/') || file.size > MAX_AVATAR_BYTES) {
        throw new Error(t('avatar_invalid'));
      }
      const target = await createWorkspaceAvatarUploadTarget(
        workspace.id,
        file.name
      );
      await uploadWorkspaceAvatarFile(target, file);
      return updateWorkspaceAvatar(workspace.id, target.filePath);
    },
    onError: (error) => {
      setPreview(workspace.avatar_url ?? null);
      toast.error(t('avatar_error'), {
        description: error instanceof Error ? error.message : undefined,
      });
    },
    onSuccess: async (result) => {
      setPreview(result.avatarUrl);
      await refreshWorkspace();
      toast.success(t('avatar_updated'));
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => deleteWorkspaceAvatar(workspace.id),
    onError: () => {
      setPreview(workspace.avatar_url ?? null);
      toast.error(t('avatar_error'));
    },
    onSuccess: async () => {
      setPreview(null);
      await refreshWorkspace();
      toast.success(t('avatar_removed'));
    },
  });

  const pending = uploadMutation.isPending || removeMutation.isPending;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card/40 p-4 sm:flex-row sm:items-center sm:p-5">
      <Avatar className="h-20 w-20 rounded-2xl border shadow-sm">
        <AvatarImage className="object-cover" src={preview ?? undefined} />
        <AvatarFallback className="rounded-2xl font-semibold text-lg">
          {getInitials(workspace.name) || 'WS'}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t('avatar')}</p>
        <p className="mt-1 text-muted-foreground text-sm">
          {t('avatar_description')}
        </p>
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <input
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (localPreviewRef.current) {
                URL.revokeObjectURL(localPreviewRef.current);
              }
              localPreviewRef.current = URL.createObjectURL(file);
              setPreview(localPreviewRef.current);
              uploadMutation.mutate(file);
              event.target.value = '';
            }}
            ref={inputRef}
            type="file"
          />
          <Button
            disabled={pending}
            onClick={() => inputRef.current?.click()}
            type="button"
            variant="outline"
          >
            {pending ? <Loader2 className="animate-spin" /> : <Camera />}
            {t('avatar_choose')}
          </Button>
          {preview && (
            <Button
              aria-label={t('avatar_remove')}
              disabled={pending}
              onClick={() => removeMutation.mutate()}
              size="icon"
              type="button"
              variant="destructive"
            >
              <Trash2 />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
