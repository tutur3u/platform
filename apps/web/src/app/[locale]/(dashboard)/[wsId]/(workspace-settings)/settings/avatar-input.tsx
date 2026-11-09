'use client';

import { useMutation } from '@tanstack/react-query';
import { Loader2, UserIcon } from '@tuturuuu/icons';
import {
  createWorkspaceAvatarUploadTarget,
  updateWorkspaceAvatar,
  uploadWorkspaceAvatarFile,
} from '@tuturuuu/internal-api';
import type { Workspace } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Form } from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { Label } from '@tuturuuu/ui/label';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';
import { ImageCropper } from '@/components/image-cropper';
import { apiFetch } from '@/lib/api-fetch';

interface Props {
  workspace: Workspace;
  defaultValue?: string | null;
  disabled?: boolean;
}

const FormSchema = z.object({
  file: z.custom<File>((value) => {
    if (!value || !(value instanceof File)) {
      return false;
    }
    return value.type.startsWith('image/');
  }, 'Please upload a valid image file'),
});

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const AVATAR_SIZE = 500;

const compressAndResizeImage = (blob: Blob): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Canvas context is null'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      // Set canvas size to the desired avatar size
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;

      // Draw the cropped image (already square from cropper) to the canvas
      ctx.drawImage(img, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

      URL.revokeObjectURL(img.src);

      canvas.toBlob(
        (compressedBlob) => {
          if (compressedBlob) {
            resolve(compressedBlob);
          } else {
            reject(new Error('Blob creation failed'));
          }
        },
        'image/jpeg',
        0.8 // 80% quality for good balance of quality and file size
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
    img.src = URL.createObjectURL(blob);
  });
};

export default function AvatarInput({ workspace, disabled }: Props) {
  const t = useTranslations();
  const router = useRouter();

  const [cropperOpen, setCropperOpen] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(
    workspace?.avatar_url || null
  );

  const form = useForm({
    resolver: zodResolver(FormSchema),
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const payload = await createWorkspaceAvatarUploadTarget(
        workspace.id,
        file.name
      );
      await uploadWorkspaceAvatarFile(payload, file);
      const result = await updateWorkspaceAvatar(
        workspace.id,
        payload.filePath
      );
      return result.avatarUrl;
    },
    onSuccess: (avatarUrl) => {
      setPreviewSrc(avatarUrl);
      toast.success(t('settings-account.avatar_updated_description'));
      form.reset();
      router.refresh();
    },
    onError: (error) => {
      console.error('Error updating workspace avatar:', error);
      toast.error(t('settings-account.avatar_update_error'));
    },
  });

  const removeAvatarMutation = useMutation({
    mutationFn: async () => {
      await apiFetch(`/api/v1/workspaces/${workspace.id}/avatar`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      setPreviewSrc(null);
      toast.success(t('settings-account.avatar_removed_description'));
      router.refresh();
    },
    onError: (error) => {
      console.error('Error removing workspace avatar:', error);
      toast.error(t('settings-account.avatar_remove_error'));
      setPreviewSrc(workspace?.avatar_url || null);
    },
  });

  const saving =
    uploadAvatarMutation.isPending || removeAvatarMutation.isPending;
  const isUploadDisabled = !!disabled;

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    if (!data.file) return;

    try {
      const finalFile = data.file;

      if (finalFile.size > MAX_FILE_SIZE) {
        throw new Error('File is too large (max 2MB)');
      }

      await uploadAvatarMutation.mutateAsync(finalFile);
    } catch (error) {
      console.error('Error:', error);
      toast.error(t('settings-account.avatar_update_error'));
    }
  }

  const removeAvatar = async () => {
    setPreviewSrc(null);

    if (!workspace.avatar_url) {
      return;
    }

    await removeAvatarMutation.mutateAsync();
  };

  const handleFileSelect = async (file: File) => {
    try {
      setIsConverting(true);

      // Create URL for the processed image to show in the cropper
      const imageUrl = URL.createObjectURL(file);
      setSelectedImageUrl(imageUrl);
      setSelectedFile(file); // Keep original file for reference
      setCropperOpen(true);
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error(t('settings-account.crop_failed_description'));
    } finally {
      setIsConverting(false);
    }
  };

  const handleCropComplete = async (croppedImageBlob: Blob) => {
    try {
      // Compress and resize the cropped image to the final avatar size
      const finalBlob = await compressAndResizeImage(croppedImageBlob);

      // Create preview URL
      const previewUrl = URL.createObjectURL(finalBlob);
      setPreviewSrc(previewUrl);

      // Create file for form submission
      const finalFile = new File([finalBlob], 'avatar.jpg', {
        type: 'image/jpeg',
      });

      form.setValue('file', finalFile);
      setCropperOpen(false);

      // Clean up the selected image URL
      if (selectedImageUrl) {
        URL.revokeObjectURL(selectedImageUrl);
        setSelectedImageUrl(null);
      }
      setSelectedFile(null);
    } catch (error) {
      console.error('Error processing cropped image:', error);
      toast.error(t('settings-account.crop_failed_description'));
    }
  };

  const handleCropCancel = () => {
    setCropperOpen(false);
    if (selectedImageUrl) {
      URL.revokeObjectURL(selectedImageUrl);
      setSelectedImageUrl(null);
    }
    setSelectedFile(null);
  };

  return (
    <>
      {/* Image Cropper Dialog */}
      {selectedImageUrl && (
        <ImageCropper
          image={selectedImageUrl}
          originalFile={selectedFile}
          open={cropperOpen}
          onOpenChange={setCropperOpen}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
          title={t('settings-account.crop_avatar')}
          aspectRatio={1} // Square crop for avatars
        />
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-wrap items-center @lg:justify-end gap-2"
        >
          <Avatar
            className={cn(
              'size-12 shrink-0 overflow-hidden rounded-md font-semibold text-base'
            )}
          >
            <AvatarImage
              src={previewSrc || undefined}
              alt="Avatar"
              className={cn('rounded-md object-cover')}
            />
            <AvatarFallback className={cn('rounded-md font-semibold')}>
              {getInitials(workspace?.name) || <UserIcon className="size-5" />}
            </AvatarFallback>
          </Avatar>

          {/* Upload controls - only show if user has permission */}
          {!isUploadDisabled && (
            <>
              <div>
                <Button asChild size="sm" variant="outline">
                  <Label
                    htmlFor="file-upload"
                    className={cn(
                      isConverting
                        ? 'cursor-not-allowed text-muted-foreground'
                        : 'cursor-pointer'
                    )}
                  >
                    {isConverting
                      ? 'Converting...'
                      : previewSrc
                        ? t('settings-account.new_avatar')
                        : t('settings-account.upload_avatar')}
                  </Label>
                </Button>
                <input
                  id="file-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  disabled={isConverting}
                  onChange={(e) => {
                    if (e.target.files?.[0] && !isConverting) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
              </div>
              {previewSrc && (
                <Button
                  className="text-dynamic-red hover:text-dynamic-red"
                  onClick={removeAvatar}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t('settings-account.remove_avatar')
                  )}
                </Button>
              )}
              <Button
                type="submit"
                size="sm"
                disabled={saving || !form.getValues('file')}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('settings-account.save_avatar')
                )}
              </Button>
            </>
          )}
        </form>
      </Form>
    </>
  );
}
