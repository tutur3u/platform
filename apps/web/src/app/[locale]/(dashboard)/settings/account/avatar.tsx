// avatar.tsx
'use client';

import AvatarCard from './avatar-card';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { getInitials } from '@/utils/name-helper';
import { createClient } from '@/utils/supabase/client';
import { generateRandomUUID } from '@/utils/uuid-helper';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@repo/ui/components/ui/button';
import { Form } from '@repo/ui/components/ui/form';
import { toast } from '@repo/ui/hooks/use-toast';
import { Check, Loader2 } from 'lucide-react';
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
    return ['image/jpeg', 'image/png'].includes(value.type);
  }, 'Please upload a valid image file (JPEG or PNG)'),
});

export default function Avatar({ user }: AvatarProps) {
  const router = useRouter();
  const supabase = createClient();

  const [saving, setSaving] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    if (!data.file) return;

    setSaving(true);

    const fileName = `${generateRandomUUID()}_${data.file.name}`;
    const filePath = `${user.id}/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, data.file); // Changed 'file' to 'data.file'

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

    const res = await fetch('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ avatar_url: urlData.publicUrl }),
      headers: {
        'Content-Type': 'application/json',
      },
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

    const res = await fetch('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ avatar_url: null }),
      headers: {
        'Content-Type': 'application/json',
      },
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <AvatarCard
          src={user?.avatar_url ?? null}
          file={avatarFile}
          setFile={(file) => {
            setAvatarFile(file);
            if (file) {
              form.setValue('file', file);
            } else {
              form.clearErrors('file');
            }
          }}
          onRemove={removeAvatar}
          label={getInitials(user?.display_name || user?.email)}
        />

        <Button
          type="submit"
          size="icon"
          onClick={form.handleSubmit(onSubmit)}
          disabled={saving || !avatarFile}
        >
          {saving ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Check className="h-5 w-5" />
          )}
        </Button>
      </form>
    </Form>
  );
}
