'use client';

import { downloadPublicObject, uploadObject } from '@/lib/storage-helper';
import { Workspace } from '@/types/primitives/Workspace';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@repo/ui/components/ui/button';
import { Input } from '@repo/ui/components/ui/input';
import { toast } from '@repo/ui/hooks/use-toast';
import { Check, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { v4 as UUIDv4 } from 'uuid';

interface Props {
  workspace: Workspace;
  defaultValue?: string;
  disabled?: boolean;
}

export default function AvatarInput({ workspace, disabled }: Props) {
  const bucket = 'avatars';

  const router = useRouter();
  const supabase = createClient();

  const [file, setFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

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
            title: 'Error downloading avatar',
            description: 'There was an error downloading the avatar.',
          });
        },
      }).then((r) => (r ? setAvatarUrl(r) : null));
  }, [workspace.avatar_url, supabase]);

  const uploadAvatar = async () => {
    await uploadObject({
      supabase,
      bucket,
      file,
      path: UUIDv4(),
      beforeStart: () => setUploading(true),
      onComplete: () => setUploading(false),
      onSuccess: async (url) => {
        const { error: updateError } = await supabase
          .from('workspaces')
          .update({ avatar_url: url })
          .eq('id', workspace.id);

        if (updateError) {
          toast({
            title: 'Error uploading avatar',
            description: 'There was an error uploading the avatar.',
          });
          return;
        }

        toast({
          title: 'Workspace updated',
          description: 'Workspace avatar updated successfully.',
        });

        setFile(null);
        router.refresh();
      },
      onError: () => {
        toast({
          title: 'Error uploading avatar',
          description: 'There was an error uploading the avatar.',
        });
      },
    });
  };

  return (
    <>
      {avatarUrl ? (
        <div className="mb-4 flex items-center justify-center">
          <Image
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
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={disabled}
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
