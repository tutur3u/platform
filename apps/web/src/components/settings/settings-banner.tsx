'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Trash2 } from '@tuturuuu/icons';
import {
  removeCurrentUserBanner,
  uploadCurrentUserBanner,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import {
  currentUserProfileQueryKey,
  useCurrentUserProfile,
} from '@/hooks/use-current-user-profile';

export function UserBanner({ userId }: { userId: string }) {
  const t = useTranslations('settings-account');
  const queryClient = useQueryClient();
  const profile = useCurrentUserProfile({ userId });
  const input = useRef<HTMLInputElement>(null);
  // A failed response can follow a committed upload; retries retain its receipt.
  const pending = useRef<{ file: File; operationId: string } | null>(null);
  const removal = useRef<string | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: currentUserProfileQueryKey });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (pending.current?.file !== file)
        pending.current = { file, operationId: crypto.randomUUID() };
      return uploadCurrentUserBanner(file, pending.current.operationId);
    },
    onSuccess: async () => {
      pending.current = null;
      toast.success(t('banner_updated'));
      await refresh();
    },
    onError: () => toast.error(t('banner_update_error')),
  });
  const remove = useMutation({
    mutationFn: () => {
      removal.current ??= crypto.randomUUID();
      return removeCurrentUserBanner(removal.current);
    },
    onSuccess: async () => {
      removal.current = null;
      toast.success(t('banner_removed'));
      await refresh();
    },
    onError: () => toast.error(t('banner_update_error')),
  });
  const busy = upload.isPending || remove.isPending;
  const url = profile.data?.banner_url;
  return (
    <div className="grid w-full gap-3">
      {url && (
        // Public, immutable profile media; preserve native image loading.
        // biome-ignore lint/performance/noImgElement: remote profile media URL
        <img
          src={url}
          alt={t('banner')}
          className="aspect-[3/1] w-full rounded-lg object-cover"
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ImagePlus className="size-4" />
          )}
          {t(url ? 'change_banner' : 'upload_banner')}
        </Button>
        {upload.isError && pending.current && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (pending.current) upload.mutate(pending.current.file);
            }}
          >
            {t('retry_banner')}
          </Button>
        )}
        {url && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => remove.mutate()}
          >
            <Trash2 className="size-4" />
            {t('remove_banner')}
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        className="hidden"
        aria-label={t('upload_banner')}
        accept="image/png,image/jpeg,image/webp,image/gif"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) upload.mutate(file);
        }}
      />
    </div>
  );
}
