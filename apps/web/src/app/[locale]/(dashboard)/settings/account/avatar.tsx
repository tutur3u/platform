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

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    console.log('onSubmit called', data);
    if (!data.file) return;

    setSaving(true);

    const fileName = `${generateRandomUUID()}_${data.file.name}`;
    const filePath = `${user.id}/${fileName}`;

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
    }

    form.reset();
    setSaving(false);
  }

  const removeAvatar = async () => {
    setSaving(true);

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
    form.setValue('file', file);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <AvatarCard
          src={user?.avatar_url || null}
          onFileSelect={handleFileSelect}
          onRemove={removeAvatar}
          label={getInitials(user?.display_name || user?.email)}
        />

        <Button
          type="submit"
          size="icon"
          disabled={saving || !form.getValues('file')}
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
