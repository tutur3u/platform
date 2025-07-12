'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { Workspace } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Check, Loader2 } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import NextImage from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ImageCropper } from '@/components/image-cropper';
import { convertHeicToJpeg, isHeicFile } from '@/lib/heic-converter';
import { downloadPublicObject } from '@/lib/storage-helper';

interface Props {
  workspace: Workspace;
  defaultValue?: string | null;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const AVATAR_SIZE = 500;

export default function AvatarInput({ workspace, disabled }: Props) {
  const bucket = 'avatars';
  const t = useTranslations();
  const router = useRouter();
  const supabase = createClient();

  const [file, setFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (workspace.avatar_url)
      downloadPublicObject({
        supabase,
        bucket,
        path: workspace.avatar_url,
        onSuccess: setAvatarUrl,
        onError: () => {
          toast({
            title: t('common.error'),
            description: t('settings-account.avatar_update_error'),
          });
        },
      }).then((r) => (r ? setAvatarUrl(r) : null));
  }, [workspace.avatar_url, supabase, t]);

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

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(blob);
    });
  };

  const uploadAvatar = async () => {
    if (!file) return;

    setUploading(true);

    try {
      // The file is already the cropped and compressed blob
      if (file.size > MAX_FILE_SIZE) {
        throw new Error('File is too large (max 2MB)');
      }

      const filePath = `${generateRandomUUID()}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('workspaces')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', workspace.id);

      if (updateError) throw updateError;

      toast({
        title: t('settings-account.avatar_updated'),
        description: t('settings-account.avatar_updated_description'),
      });

      setFile(null);
      router.refresh();
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: t('settings-account.update_failed'),
        description: t('settings-account.avatar_update_error'),
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (file: File | null) => {
    if (!file) return;

    try {
      setIsConverting(true);
      let processedFile = file;

      // Convert HEIC files to JPEG first for browser compatibility
      if (isHeicFile(file)) {
        console.log('Converting HEIC file to JPEG for display...');
        processedFile = await convertHeicToJpeg(file);
      }

      // Create URL for the processed image to show in the cropper
      const imageUrl = URL.createObjectURL(processedFile);
      setSelectedImageUrl(imageUrl);
      setSelectedFile(file); // Keep original file for reference
      setCropperOpen(true);
    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        title: t('settings-account.crop_failed'),
        description:
          error instanceof Error
            ? error.message
            : t('settings-account.crop_failed_description'),
        variant: 'destructive',
      });
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
      setAvatarUrl(previewUrl);

      // Create file for upload
      const finalFile = new File([finalBlob], 'avatar.jpg', {
        type: 'image/jpeg',
      });

      setFile(finalFile);
      setCropperOpen(false);

      // Clean up the selected image URL
      if (selectedImageUrl) {
        URL.revokeObjectURL(selectedImageUrl);
        setSelectedImageUrl(null);
      }
      setSelectedFile(null);
    } catch (error) {
      console.error('Error processing cropped image:', error);
      toast({
        title: t('settings-account.crop_failed'),
        description: t('settings-account.crop_failed_description'),
        variant: 'destructive',
      });
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
          originalFile={selectedFile || undefined}
          open={cropperOpen}
          onOpenChange={setCropperOpen}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
          title={t('settings-account.crop_avatar')}
          aspectRatio={1} // Square crop for avatars
        />
      )}

      {avatarUrl ? (
        <div className="mb-4 flex items-center justify-center">
          <NextImage
            width={320}
            height={320}
            src={avatarUrl}
            alt="Avatar"
            className="aspect-square rounded-lg object-cover"
          />
        </div>
      ) : null}

      <div className="flex items-start gap-2">
        <Input
          type="file"
          id="workspace-avatar"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif"
          onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
          disabled={disabled || isConverting}
          placeholder={isConverting ? 'Converting HEIC...' : undefined}
        />

        <Button
          type="submit"
          size="icon"
          onClick={uploadAvatar}
          disabled={!file || uploading}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Check className="h-5 w-5" />
          )}
        </Button>
      </div>
    </>
  );
}
