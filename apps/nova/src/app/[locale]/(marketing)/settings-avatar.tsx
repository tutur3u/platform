'use client';

import { Loader2, Settings, UserIcon } from '@tuturuuu/icons';
import {
  removeCurrentUserAvatar,
  uploadCurrentUserAvatar,
} from '@tuturuuu/internal-api';
import { optimizeProfileMediaFile } from '@tuturuuu/internal-api/profile-media';
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
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useRouter } from 'next/navigation';
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

export default function UserAvatar({ user }: AvatarProps) {
  const t = useTranslations();
  const router = useRouter();

  const [open, setOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(
    user?.avatar_url || null
  );

  const form = useForm({
    resolver: zodResolver(FormSchema),
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    if (!data.file) return;

    setSaving(true);

    try {
      const result = await uploadCurrentUserAvatar(data.file);
      if (!result.finalizeOk) throw new Error(result.finalizeError);

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

    const removed = await removeCurrentUserAvatar().then(
      () => true,
      () => false
    );

    if (!removed) {
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
      const optimizedFile = await optimizeProfileMediaFile(file, 'avatar');
      const fileURL = URL.createObjectURL(optimizedFile);
      setPreviewSrc(fileURL);
      form.setValue('file', optimizedFile);
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
