'use client';

import { createClient } from '@ncthub/supabase/next/client';
import { WorkspaceUser } from '@ncthub/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback, AvatarImage } from '@ncthub/ui/avatar';
import { Button } from '@ncthub/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ncthub/ui/dialog';
import { Form } from '@ncthub/ui/form';
import { useForm } from '@ncthub/ui/hooks/use-form';
import { toast } from '@ncthub/ui/hooks/use-toast';
import { Loader2, Settings, UserIcon } from '@ncthub/ui/icons';
import { Label } from '@ncthub/ui/label';
import { zodResolver } from '@ncthub/ui/resolvers';
import { getInitials } from '@ncthub/utils/name-helper';
import { generateRandomUUID } from '@ncthub/utils/uuid-helper';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const supabase = createClient();

  const [open, setOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(
    user?.avatar_url || null
  );

  const form = useForm({
    resolver: zodResolver(FormSchema),
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

    setSaving(true);

    try {
      const compressedBlob = await compressImage(data.file);
      const compressedFile = new File([compressedBlob], data.file.name, {
        type: data.file.type,
      });

      if (compressedFile.size > MAX_FILE_SIZE) {
        throw new Error('Compressed file is still too large');
      }

      const filePath = `${generateRandomUUID()}`;

      const { data: _, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, compressedFile);

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
        title: 'Avatar updated',
        description: 'Your avatar has been successfully updated.',
      });
      router.refresh();
      setOpen(false);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Update failed',
        description:
          'There was an error updating your avatar. Please try again.',
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
        title: 'Remove failed',
        description:
          'There was an error removing your avatar. Please try again.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Avatar removed',
        description: 'Your avatar has been successfully removed.',
      });
      router.refresh();
    }

    setSaving(false);
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
      toast({
        title: 'Compression failed',
        description:
          'There was an error compressing your image. Please try again.',
        variant: 'destructive',
      });
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
              <Avatar className="h-32 w-32 cursor-pointer overflow-visible border border-foreground text-3xl font-semibold">
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
              <Avatar className="h-32 w-32 overflow-visible text-3xl font-semibold">
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
  );
}
