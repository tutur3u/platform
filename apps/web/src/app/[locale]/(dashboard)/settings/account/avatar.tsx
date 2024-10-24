'use client';

import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { getInitials } from '@/utils/name-helper';
import { createClient } from '@/utils/supabase/client';
import { generateRandomUUID } from '@/utils/uuid-helper';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/ui/components/ui/avatar';
import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';
import { Form } from '@repo/ui/components/ui/form';
import { Label } from '@repo/ui/components/ui/label';
import { toast } from '@repo/ui/hooks/use-toast';
import { Loader2, Settings, UserIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
  const supabase = createClient();

  const [open, setOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(
    user?.avatar_url || null
  );

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    console.log('onSubmit called', data);
    if (!data.file) return;

    setSaving(true);

    const filePath = `${generateRandomUUID()}`;

    const { data: _, error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, data.file);

    if (uploadError) {
      toast({
        title: 'Upload failed',
        description:
          'There was an error uploading your avatar. Please try again.',
        variant: 'destructive',
      });
      setSaving(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const { error: updateError } = await supabase
      .from('users')
      .update({ avatar_url: urlData.publicUrl })
      .eq('id', user.id);

    if (updateError) {
      toast({
        title: 'Update failed',
        description:
          'There was an error updating your avatar. Please try again.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Avatar updated',
        description: 'Your avatar has been successfully updated.',
      });
      router.refresh();
      setOpen(false);
    }

    form.reset();
    setSaving(false);
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

  const handleFileSelect = (file: File) => {
    const fileURL = URL.createObjectURL(file);
    setPreviewSrc(fileURL);
    form.setValue('file', file);
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
              <Avatar className="border-foreground h-32 w-32 cursor-pointer overflow-visible border text-3xl font-semibold">
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
                className="absolute bottom-0 right-0 rounded-full backdrop-blur-lg"
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