'use client';

import { Workspace } from '@/types/primitives/Workspace';
import { Button } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';
import { useState } from 'react';

interface Props {
  workspace: Workspace;
}

export default function Security({ workspace }: Props) {
  const isSystemWs = workspace.id === '00000000-0000-0000-0000-000000000000';

  const { t } = useTranslation('ws-settings');

  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (isSystemWs) return;

    setIsDeleting(true);
    await deleteWorkspace(workspace.id);
    setIsDeleting(false);
  };

  return (
    <div className="flex flex-col rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900">
      <div className="mb-1 text-2xl font-bold">{t('security')}</div>
      <div className="mb-4 font-semibold text-zinc-500">
        {t('security_description')}
      </div>

      <div className="grid h-full items-end gap-4 text-center xl:grid-cols-2">
        <Button
          onClick={isSystemWs ? undefined : handleDelete}
          disabled={isSystemWs}
          className={`${
            isSystemWs
              ? 'cursor-not-allowed opacity-50'
              : 'hover:border-red-500/30 hover:bg-red-500/20 dark:hover:border-red-300/30 dark:hover:bg-red-300/20'
          } col-span-full mt-2 flex w-full items-center justify-center rounded border border-red-300/20 bg-red-300/10 p-2 font-semibold text-red-600 transition dark:text-red-300`}
        >
          {isDeleting ? t('deleting') : t('delete')}
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

    if (!res.ok) throw new Error('Failed to delete workspace');
    if (options?.onSuccess) options.onSuccess();
  } catch (e) {
    if (options?.onError) options.onError();
    // showNotification({
    //   title: 'Failed to delete workspace',
    //   message: 'Make sure there are no teams in this workspace',
    //   color: 'red',
    // });
  } finally {
    if (options?.onCompleted) options.onCompleted();
  }
};
