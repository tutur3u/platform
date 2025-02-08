'use client';

import { Workspace } from '@repo/types/primitives/Workspace';
import { Button } from '@repo/ui/components/ui/button';
import { toast } from '@repo/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  workspace?: Workspace | null;
}

export default function Security({ workspace }: Props) {
  const isSystemWs = workspace?.id === '00000000-0000-0000-0000-000000000000';

  const t = useTranslations('ws-settings');
  const router = useRouter();

  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (isSystemWs || !workspace) return;
    setIsDeleting(true);

    await deleteWorkspace(workspace.id, {
      onSuccess: () => {
        router.push('/onboarding');
        router.refresh();
      },
      onError: () => setIsDeleting(false),
    });
  };

  return (
    <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
      <div className="mb-1 text-2xl font-bold">{t('security')}</div>
      <div className="mb-4 font-semibold text-foreground/80">
        {t('security_description')}
      </div>

      <div className="grid h-full items-end gap-4 text-center xl:grid-cols-2">
        <Button
          onClick={handleDelete}
          className={`${
            isSystemWs
              ? 'cursor-not-allowed opacity-50'
              : 'hover:border-red-500/30 hover:bg-red-500/20 dark:hover:border-red-300/30 dark:hover:bg-red-300/20'
          } col-span-full mt-2 flex w-full items-center justify-center rounded border border-red-300/20 bg-red-300/10 p-2 font-semibold text-red-600 transition dark:text-red-300`}
          disabled={!workspace || isSystemWs || isDeleting}
        >
          {isDeleting ? `${t('deleting')}...` : t('delete')}
        </Button>
      </div>
    </div>
  );
}

const deleteWorkspace = async (
  wsId: string,
  options?: {
    onSuccess?: () => void;
    onError?: () => void;
    onCompleted?: () => void;
  }
) => {
  try {
    const res = await fetch(`/api/workspaces/${wsId}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      if (options?.onError) options.onError();
      toast({
        title: 'Failed to delete workspace',
        content: 'Please try again later.',
        color: 'red',
      });
    }

    if (options?.onSuccess) options.onSuccess();
  } catch (e) {
    if (options?.onError) options.onError();
    toast({
      title: 'Failed to delete workspace',
      content: 'Please try again later.',
      color: 'red',
    });
  } finally {
    if (options?.onCompleted) options.onCompleted();
  }
};
