'use client';

import { Loader2, UserIcon, AlertTriangle } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Workspace, WorkspaceUser } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Form } from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/sonner';
import { useWorkspacePermission } from '@tuturuuu/ui/hooks/use-workspace-permission';
import { Label } from '@tuturuuu/ui/label';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import React, { useEffect, useState } from 'react';
import * as z from 'zod';
import { ImageCropper } from '@/components/image-cropper';
import { useWorkspaceUser } from '@tuturuuu/ui/hooks/use-workspace-user';

interface Props {
  workspace: Workspace;
  defaultValue?: string | null;
  disabled?: boolean;
  onPermissionCheckComplete?: (hasPermission: boolean) => void;
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

export default function AvatarInput({
  workspace,
  disabled,
  onPermissionCheckComplete,
}: Props) {
  const bucket = 'avatars';
  const t = useTranslations();
  const router = useRouter();
  const supabase = createClient();

  // Fetch current workspace user
  const { data: user, isLoading: isUserLoading } = useWorkspaceUser();

  const [cropperOpen, setCropperOpen] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  const [saving, setSaving] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(
    workspace?.avatar_url || null
  );

  // Check if user has manage_workspace_settings permission
  // Only check permission once user data is loaded
  const { hasPermission, isLoading: isCheckingPermission } =
    useWorkspacePermission({
      wsId: workspace.id,
      permission: 'manage_workspace_settings',
      user: user ?? ({} as WorkspaceUser),
      enabled: !!user, // Only run query when user is loaded
    });

  // Notify parent component when permission check completes
  useEffect(() => {
    if (!isCheckingPermission && onPermissionCheckComplete) {
      onPermissionCheckComplete(hasPermission ?? false);
    }
  }, [hasPermission, isCheckingPermission, onPermissionCheckComplete]);

  const form = useForm({
    resolver: zodResolver(FormSchema),
  });

  // Determine if upload should be disabled (including user loading state)
  const isUploadDisabled =
    disabled || !hasPermission || isCheckingPermission || isUserLoading;

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    if (!data.file) return;

    setSaving(true);

    try {
      // The file from the form is already the cropped and compressed blob
      const finalFile = data.file;

      if (finalFile.size > MAX_FILE_SIZE) {
        throw new Error('File is too large (max 2MB)');
      }

      const filePath = `${generateRandomUUID()}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, finalFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('workspaces')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', workspace.id);

      if (updateError) throw updateError;

      toast.success(t('settings-account.avatar_updated_description'));
      router.refresh();
    } catch (error) {
      console.error('Error:', error);
      toast.error(t('settings-account.avatar_update_error'));
    } finally {
      form.reset();
      setSaving(false);
    }
  }

  const removeAvatar = async () => {
    setSaving(true);
    setPreviewSrc(null);

    if (!workspace.avatar_url) {
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('workspaces')
      .update({ avatar_url: null })
      .eq('id', workspace.id);

    if (updateError) {
      toast.error(t('settings-account.avatar_remove_error'));
    } else {
      toast.success(t('settings-account.avatar_removed_description'));
      router.refresh();
    }

    setSaving(false);
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
          <div className="flex flex-col items-center gap-4">
            <Avatar
              className={cn(
                'h-32 w-32 overflow-hidden rounded-md font-semibold text-3xl'
              )}
            >
              <AvatarImage
                src={previewSrc || undefined}
                alt="Avatar"
                className={cn('rounded-md object-cover')}
              />
              <AvatarFallback className={cn('rounded-md font-semibold')}>
                {getInitials(workspace?.name) || (
                  <UserIcon className="h-12 w-12" />
                )}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Permission denied message */}
          {!isCheckingPermission && !hasPermission && !disabled && (
            <div className="flex items-center gap-2 rounded-lg border border-dynamic-amber/30 bg-dynamic-amber/10 p-3">
              <AlertTriangle className="h-5 w-5 text-dynamic-amber" />
              <p className="text-sm text-dynamic-amber">
                {t('settings-account.insufficient_permissions_avatar')}
              </p>
            </div>
          )}

          {/* Upload controls - only show if user has permission */}
          {!isUploadDisabled && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div>
                <Label
                  htmlFor="file-upload"
                  className={cn(
                    'inline-block rounded-md border p-3 px-4 text-center max-sm:w-full',
                    isConverting
                      ? 'cursor-not-allowed opacity-50'
                      : 'cursor-pointer'
                  )}
                >
                  {isConverting
                    ? 'Converting...'
                    : previewSrc
                      ? t('settings-account.new_avatar')
                      : t('settings-account.upload_avatar')}
                </Label>
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
                  variant="destructive"
                  onClick={removeAvatar}
                  type="button"
                >
                  {saving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    t('settings-account.remove_avatar')
                  )}
                </Button>
              )}
              <Button
                type="submit"
                disabled={saving || !form.getValues('file')}
              >
                {saving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  t('settings-account.save_avatar')
                )}
              </Button>
            </div>
          )}
        </form>
      </Form>
    </>
  );
}
