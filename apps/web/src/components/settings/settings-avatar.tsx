'use client';

import { useQueryClient } from '@tanstack/react-query';
import { UserIcon } from '@tuturuuu/icons';
import {
  removeCurrentUserAvatar,
  uploadCurrentUserAvatar,
} from '@tuturuuu/internal-api';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  AvatarEditor,
  type AvatarEditorCropRequest,
} from '@tuturuuu/ui/custom/avatar-editor';
import { toast } from '@tuturuuu/ui/sonner';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ImageCropper } from '@/components/image-cropper';
import { currentUserProfileQueryKey } from '@/hooks/use-current-user-profile';

interface AvatarProps {
  user: WorkspaceUser;
}

export default function UserAvatar({ user }: AvatarProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const router = useRouter();
  const initials = getInitials(user?.display_name || user?.email);

  return (
    <AvatarEditor
      src={user?.avatar_url || null}
      alt={t('settings-account.avatar')}
      title={t('settings-account.avatar')}
      description={t('settings-account.avatar-description')}
      fallback={initials || <UserIcon />}
      labels={{
        edit: t('settings-account.avatar'),
        fileTooLarge: t('settings-account.avatar_compression_error'),
        invalidImage: t('settings-account.crop_failed_description'),
        processFailed: t('settings-account.crop_failed_description'),
        remove: t('settings-account.remove_avatar'),
        replace: t('settings-account.new_avatar'),
        save: t('settings-account.save_avatar'),
        upload: t('settings-account.upload_avatar'),
      }}
      onSave={async (file) => {
        const { publicUrl, finalizeOk, finalizeError } =
          await uploadCurrentUserAvatar(file, file.name);
        if (!finalizeOk) {
          toast.error(
            finalizeError || t('settings-account.avatar_update_error')
          );
          throw new Error(finalizeError || 'Avatar profile update failed');
        }

        toast.success(t('settings-account.avatar_updated'));
        await queryClient.invalidateQueries({
          queryKey: [...currentUserProfileQueryKey],
        });
        router.refresh();
        return publicUrl;
      }}
      onRemove={async () => {
        try {
          await removeCurrentUserAvatar();
        } catch (error) {
          toast.error(t('settings-account.avatar_remove_error'));
          throw error;
        }

        toast.success(t('settings-account.avatar_removed'));
        await queryClient.invalidateQueries({
          queryKey: [...currentUserProfileQueryKey],
        });
        router.refresh();
      }}
      renderCropper={(crop: AvatarEditorCropRequest) => (
        <ImageCropper
          image={crop.imageUrl}
          originalFile={crop.file}
          open={crop.open}
          onOpenChange={crop.onOpenChange}
          onCropComplete={crop.onCropComplete}
          onCancel={crop.onCancel}
          title={t('settings-account.crop_avatar')}
          aspectRatio={1}
        />
      )}
    />
  );
}
