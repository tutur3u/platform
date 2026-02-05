'use client';

import { Loader2, UserIcon } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Form } from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Label } from '@tuturuuu/ui/label';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';
import { ImageCropper } from '@/components/image-cropper';

interface AvatarProps {
  user: WorkspaceUser;
}

const FormSchema = z.object({
  file: z.custom<File>((value) => {
    if (!value || !(value instanceof File)) {
      return false;
    }
    return value.type.startsWith('image/');
  }, 'Please upload a valid image file'),
});

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const AVATAR_SIZE = 500;

export default function UserAvatar({ user }: AvatarProps) {
  const t = useTranslations();
  const router = useRouter();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  const [saving, setSaving] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(
    user?.avatar_url || null
  );

  const form = useForm({
    resolver: zodResolver(FormSchema),
  });

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
        .from('avatars')
        .upload(filePath, finalFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      toast({
        title: t('settings-account.avatar_updated'),
        description: t('settings-account.avatar_updated_description'),
      });
      router.refresh();
      setOpen(false);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: t('settings-account.update_failed'),
        description: t('settings-account.avatar_update_error'),
        variant: 'destructive',
      });
    } finally {
      form.reset();
      setSaving(false);
    }
  }

  const removeAvatar = async () => {
    setSaving(true);
    setPreviewSrc(null);

    if (!user.avatar_url) {
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ avatar_url: null })
      .eq('id', user.id);

    if (updateError) {
      toast({
        title: t('settings-account.remove_failed'),
        description: t('settings-account.avatar_remove_error'),
        variant: 'destructive',
      });
    } else {
      toast({
        title: t('settings-account.avatar_removed'),
        description: t('settings-account.avatar_removed_description'),
      });
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
        <Dialog
          open={open}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              form.reset();
              setPreviewSrc(user?.avatar_url || null);
            }
            setOpen(isOpen);
          }}
        >
          <DialogTrigger asChild>
            <div className="flex items-center justify-center">
              <div className="relative flex w-fit flex-col items-center justify-center gap-4">
                <Avatar className="h-32 w-32 cursor-pointer overflow-hidden rounded-md border border-foreground font-semibold text-3xl">
                  <AvatarImage
                    src={previewSrc || undefined}
                    alt="Avatar"
                    className="object-cover"
                  />
                  <AvatarFallback className="rounded-none font-semibold">
                    {getInitials(user?.display_name || user?.email) || (
                      <UserIcon className="h-12 w-12" />
                    )}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('settings-account.avatar')}</DialogTitle>
              <DialogDescription>
                {t('settings-account.avatar-description')}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
              <div className="flex flex-col items-center gap-4">
                <Avatar className="h-32 w-32 overflow-hidden rounded-md font-semibold text-3xl">
                  <AvatarImage
                    src={previewSrc || undefined}
                    alt="Avatar"
                    className="object-cover"
                  />
                  <AvatarFallback className="rounded-none font-semibold">
                    {getInitials(user?.display_name || user?.email) || (
                      <UserIcon className="h-12 w-12" />
                    )}
                  </AvatarFallback>
                </Avatar>
              </div>
              <DialogFooter className="flex-wrap max-sm:gap-2">
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
                  <Button variant="destructive" onClick={removeAvatar}>
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
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Form>
    </>
  );
}
