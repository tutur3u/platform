'use client';
import { InternalApiError } from '@tuturuuu/internal-api';
import {
  type ProfileMediaKind,
  uploadCurrentUserProfileMedia,
} from '@tuturuuu/internal-api/profile-media';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function ProfileMediaField({
  kind,
  disabled,
  hasImage,
  onPending,
  onChange,
}: {
  kind: ProfileMediaKind;
  disabled: boolean;
  hasImage: boolean;
  onPending: (pending: boolean) => void;
  onChange: (url: string) => void;
}) {
  const t = useTranslations('lettin');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<
    'invalidProfileImage' | 'profileUploadLimit' | 'requestFailed' | null
  >(null);
  return (
    <div className="space-y-2">
      <label className="block space-y-2 text-sm">
        {t(kind === 'avatar' ? 'profileavatar_url' : 'profilebanner_url')}
        <Input
          type="file"
          disabled={disabled}
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (!file) return;
            setError(null);
            if (
              !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
                file.type
              ) ||
              !file.size ||
              file.size > (kind === 'avatar' ? 2 : 5) * 1024 ** 2
            ) {
              setError('invalidProfileImage');
              return;
            }
            setUploading(true);
            onPending(true);
            try {
              onChange(await uploadCurrentUserProfileMedia(kind, file));
            } catch (error) {
              setError(
                error instanceof InternalApiError && error.status === 429
                  ? 'profileUploadLimit'
                  : 'requestFailed'
              );
            } finally {
              setUploading(false);
              onPending(false);
            }
          }}
        />
        <small className="text-muted-foreground">
          {t(kind === 'avatar' ? 'avatarUploadHint' : 'bannerUploadHint')}
        </small>
      </label>
      {hasImage && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onChange('')}
        >
          {t('removeImage')}
        </Button>
      )}
      {uploading && (
        <p role="status" className="text-sm">
          {t('uploadingImage')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {t(error)}
        </p>
      )}
    </div>
  );
}
