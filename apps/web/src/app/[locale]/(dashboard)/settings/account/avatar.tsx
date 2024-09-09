'use client';

import AvatarCard from '@/components/settings/AvatarCard';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { getInitials } from '@/utils/name-helper';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@repo/ui/components/ui/button';
import { Form } from '@repo/ui/components/ui/form';
import { toast } from '@repo/ui/hooks/use-toast';
import { Check, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface AvatarProps {
  user: WorkspaceUser;
}

const FormSchema = z.object({
  avatar: z.instanceof(File),
});

export default function Avatar({ user }: AvatarProps) {
  const router = useRouter();
  const t = useTranslations('settings-account');

  const [saving, setSaving] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setSaving(true);

    const formData = new FormData();
    formData.append('avatar', data.avatar);

    const res = await fetch('/api/auth/avatar', {
      method: 'PATCH',
      body: formData,
    });

    if (res.ok) {
      toast({
        title: 'Avatar updated',
        description: 'Your avatar has been successfully updated.',
      });

      router.refresh();
    } else {
      toast({
        title: 'An error occurred',
        description: 'Please try again.',
      });
    }

    form.reset();
    setAvatarFile(null);
    setSaving(false);
  }

  const removeAvatar = async () => {
    setSaving(true);

    const res = await fetch('/api/auth/avatar', {
      method: 'PATCH',
      body: JSON.stringify({ avatarUrl: null }),
    });

    if (res.ok) {
      toast({
        title: 'Avatar removed',
        description: 'Your avatar has been successfully removed.',
      });

      router.refresh();
    } else {
      toast({
        title: 'An error occurred',
        description: 'Please try again.',
      });
    }

    setAvatarFile(null);
    setSaving(false);
  };

  // const removeAvatar = async () => {
  // If user has an avatar, remove it
  // if (user?.avatar_url) {
  // await updateUser?.({
  //   avatar_url: null,
  // });
  // }

  // If user has a local avatar file, remove it
  // setAvatarFile(null);
  // };

  // return null;

  // return (
  //   <AvatarCard
  //     src={avatarUrl}
  //     file={avatarFile}
  //     setFile={setAvatarFile}
  //     onRemove={removeAvatar}
  //     label={getInitials(user?.display_name || user?.email)}
  //   />
  // );

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
          <AvatarCard
            src={user?.avatar_url ?? null}
            file={avatarFile}
            setFile={setAvatarFile}
            onRemove={removeAvatar}
            label={getInitials(user?.display_name || user?.email)}
          />

          <Button
            type="submit"
            size="icon"
            onClick={form.handleSubmit(onSubmit)}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Check className="h-5 w-5" />
            )}
          </Button>
        </form>
      </Form>
    </>
  );
}
