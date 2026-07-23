'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Loader2, Trash2 } from '@tuturuuu/icons';
import {
  removeCurrentUserAvatar,
  uploadCurrentUserAvatar,
} from '@tuturuuu/internal-api';
import type { CurrentUserProfileResponse } from '@tuturuuu/internal-api/users';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

export const satelliteProfileQueryKey = ['current-user-profile'] as const;

export function ProfileAvatarEditor({
  profile,
}: {
  profile: CurrentUserProfileResponse;
}) {
  const t = useTranslations('settings-account');
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: [...satelliteProfileQueryKey] });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith('image/')) throw new Error('invalid-file');
      if (file.size > 2 * 1024 * 1024) throw new Error('file-too-large');
      const result = await uploadCurrentUserAvatar(file);
      if (!result.finalizeOk) throw new Error(result.finalizeError);
    },
    onError: () => toast.error(t('avatar_update_error')),
    onSuccess: async () => {
      toast.success(t('avatar_updated'));
      await refresh();
    },
  });
  const removeMutation = useMutation({
    mutationFn: removeCurrentUserAvatar,
    onError: () => toast.error(t('avatar_remove_error')),
    onSuccess: async () => {
      toast.success(t('avatar_removed'));
      await refresh();
    },
  });
  const busy = uploadMutation.isPending || removeMutation.isPending;
  const name = profile.display_name || profile.full_name || profile.email || '';

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar className="size-20 border">
        <AvatarImage alt={name} src={profile.avatar_url ?? undefined} />
        <AvatarFallback className="text-lg">{getInitials(name)}</AvatarFallback>
      </Avatar>
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="sr-only"
          disabled={busy}
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) uploadMutation.mutate(file);
            event.target.value = '';
          }}
        />
        <Button
          disabled={busy}
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
        >
          {uploadMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Camera className="size-4" />
          )}
          {t('new_avatar')}
        </Button>
        {profile.avatar_url ? (
          <Button
            disabled={busy}
            type="button"
            variant="outline"
            onClick={() => removeMutation.mutate(undefined)}
          >
            {removeMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            {t('remove_avatar')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
