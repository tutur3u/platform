'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Settings, UserIcon } from '@tuturuuu/icons';
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
import { Label } from '@tuturuuu/ui/label';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';

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
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(
    user?.avatar_url || null
  );

  const form = useForm({
    resolver: zodResolver(FormSchema),
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async ({
      compressedFile,
      filename,
    }: {
      compressedFile: File;
      filename: string;
    }) => {
      // Step 1: Get upload URL
      const urlRes = await fetch('/api/v1/users/me/avatar/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename }),
      });

      if (!urlRes.ok) throw new Error('Failed to get upload URL');

      const { uploadUrl, publicUrl } = await urlRes.json();

      // Step 2: Upload file to storage
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': compressedFile.type,
        },
        body: compressedFile,
      });

      if (!uploadRes.ok) throw new Error('Failed to upload file');

      // Step 3: Update user profile with new avatar URL
      const updateRes = await fetch('/api/v1/users/me/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ avatar_url: publicUrl }),
      });

      if (!updateRes.ok) throw new Error('Failed to update profile');

      return { publicUrl };
    },
    onSuccess: () => {
      toast.success(t('settings-account.avatar_updated'));
      // Invalidate user queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['user', 'me'] });
      setOpen(false);
      form.reset();
    },
    onError: (error) => {
      console.error('Error uploading avatar:', error);
      toast.error(t('settings-account.avatar_update_error'));
      form.reset();
    },
  });

  const removeAvatarMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/users/me/avatar', {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to remove avatar');
    },
    onMutate: async () => {
      // Optimistically remove avatar preview
      setPreviewSrc(null);
    },
    onSuccess: () => {
      toast.success(t('settings-account.avatar_removed'));
      // Invalidate user queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['user', 'me'] });
      form.reset();
    },
    onError: (error) => {
      console.error('Error removing avatar:', error);
      // Rollback optimistic update
      setPreviewSrc(user?.avatar_url || null);
      toast.error(t('settings-account.avatar_remove_error'));
    },
  });

  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = AVATAR_SIZE;
          canvas.height = AVATAR_SIZE;

          if (ctx) {
            ctx.drawImage(img, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  resolve(blob);
                } else {
                  reject(new Error('Blob creation failed'));
                }
              },
              file.type,
              0.7 // 70% quality
            );
          } else {
            reject(new Error('Canvas context is null'));
          }
        };
      };
      reader.onerror = (error) => reject(error);
    });
  };

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    if (!data.file) return;

    try {
      const compressedBlob = await compressImage(data.file);
      const compressedFile = new File([compressedBlob], data.file.name, {
        type: data.file.type,
      });

      if (compressedFile.size > MAX_FILE_SIZE) {
        throw new Error('Compressed file is still too large');
      }

      const filename = data.file.name;

      uploadAvatarMutation.mutate({ compressedFile, filename });
    } catch (error) {
      console.error('Error compressing file:', error);
      toast.error(t('settings-account.avatar_compression_error'));
    }
  }

  const removeAvatar = () => {
    if (!user.avatar_url) {
      return;
    }

    removeAvatarMutation.mutate();
  };

  const handleFileSelect = async (file: File) => {
    try {
      const compressedBlob = await compressImage(file);
      const fileURL = URL.createObjectURL(compressedBlob);
      setPreviewSrc(fileURL);
      form.setValue(
        'file',
        new File([compressedBlob], file.name, { type: file.type })
      );
    } catch (error) {
      console.error('Error compressing image:', error);
      toast.error(t('settings-account.avatar_compression_error'));
    }
  };

  return (
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
              <Avatar className="h-32 w-32 cursor-pointer overflow-visible border border-foreground font-semibold text-3xl">
                <AvatarImage
                  src={previewSrc || undefined}
                  alt="Avatar"
                  className="rounded-full object-cover"
                />
                <AvatarFallback className="font-semibold">
                  {getInitials(user?.display_name || user?.email) || (
                    <UserIcon className="h-12 w-12" />
                  )}
                </AvatarFallback>
              </Avatar>
              <Button
                size="icon"
                className="absolute right-0 bottom-0 rounded-full backdrop-blur-lg"
              >
                <Settings className="h-5 w-5" />
              </Button>
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
              <Avatar className="h-32 w-32 overflow-visible font-semibold text-3xl">
                <AvatarImage
                  src={previewSrc || undefined}
                  alt="Avatar"
                  className="rounded-full object-cover"
                />
                <AvatarFallback className="font-semibold">
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
                  className="inline-block cursor-pointer rounded-md border p-3 px-4 text-center max-sm:w-full"
                >
                  {previewSrc
                    ? t('settings-account.new_avatar')
                    : t('settings-account.upload_avatar')}
                </Label>
                <input
                  id="file-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
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
                  disabled={removeAvatarMutation.isPending}
                >
                  {removeAvatarMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    t('settings-account.remove_avatar')
                  )}
                </Button>
              )}
              <Button
                type="submit"
                disabled={
                  uploadAvatarMutation.isPending || !form.getValues('file')
                }
              >
                {uploadAvatarMutation.isPending ? (
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
  );
}
