'use client';

import { UserIcon } from '@tuturuuu/icons';
import {
  createWorkspaceAvatarUploadTarget,
  updateWorkspaceAvatar,
  uploadWorkspaceAvatarFile,
} from '@tuturuuu/internal-api';
import type { Workspace } from '@tuturuuu/types';
import {
  AvatarEditor,
  type AvatarEditorCropRequest,
} from '@tuturuuu/ui/custom/avatar-editor';
import { toast } from '@tuturuuu/ui/sonner';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ImageCropper } from '@/components/image-cropper';
import { apiFetch } from '@/lib/api-fetch';

interface Props {
  workspace: Workspace;
  defaultValue?: string | null;
  disabled?: boolean;
}

export default function AvatarInput({
  workspace,
  defaultValue,
  disabled,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const name = defaultValue || workspace.name;
  const initials = getInitials(name);

  return (
    <AvatarEditor
      allowEdit={!disabled}
      src={workspace.avatar_url || null}
      alt={name || t('settings-account.avatar')}
      title={t('settings-account.avatar')}
      description={t('settings-account.avatar-description')}
      fallback={initials || <UserIcon />}
      labels={{
        edit: t('settings-account.avatar'),
        fileTooLarge: t('settings-account.avatar_update_error'),
        invalidImage: t('settings-account.crop_failed_description'),
        processFailed: t('settings-account.crop_failed_description'),
        remove: t('settings-account.remove_avatar'),
        replace: t('settings-account.new_avatar'),
        save: t('settings-account.save_avatar'),
        upload: t('settings-account.upload_avatar'),
      }}
      onSave={async (file) => {
        try {
          const payload = await createWorkspaceAvatarUploadTarget(
            workspace.id,
            file.name
          );
          await uploadWorkspaceAvatarFile(payload, file);
          const result = await updateWorkspaceAvatar(
            workspace.id,
            payload.filePath
          );
          toast.success(t('settings-account.avatar_updated_description'));
          router.refresh();
          return result.avatarUrl;
        } catch (error) {
          console.error('Error updating workspace avatar:', error);
          toast.error(t('settings-account.avatar_update_error'));
          throw error;
        }
      }}
      onRemove={async () => {
        try {
          await apiFetch(`/api/v1/workspaces/${workspace.id}/avatar`, {
            method: 'DELETE',
          });
        } catch (error) {
          console.error('Error removing workspace avatar:', error);
          toast.error(t('settings-account.avatar_remove_error'));
          throw error;
        }

        toast.success(t('settings-account.avatar_removed_description'));
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
