'use client';

import useTranslation from 'next-translate/useTranslation';
import { Workspace } from '@/types/primitives/Workspace';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';

interface Props {
  workspace: Workspace;
}

export default function BasicInfo({ workspace }: Props) {
  const isSystemWs = workspace.id === '00000000-0000-0000-0000-000000000000';

  const { t } = useTranslation('ws-settings');

  const router = useRouter();
  const refresh = () => router.refresh();

  const [name, setName] = useState(workspace.name);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (isSystemWs) return;

    setIsSaving(true);
    await updateWorkspace(
      {
        id: workspace.id,
        name,
      },
      {
        onSuccess: refresh,
      }
    );
    setIsSaving(false);
  };

  return (
    <div className="flex flex-col rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900">
      <div className="mb-1 text-2xl font-bold">{t('basic_info')}</div>
      <div className="mb-4 font-semibold text-zinc-500">
        {t('basic_info_description')}
      </div>

      <div className="grid w-full items-center gap-1.5">
        <Label>{t('name')}</Label>
        <Input
          placeholder={workspace.name || name || t('name_placeholder')}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          disabled={isSystemWs}
        />
      </div>

      <div className="h-full" />

      {isSystemWs || (
        <Button
          onClick={isSaving || name === workspace.name ? undefined : handleSave}
          disabled={isSaving || name === workspace.name}
          className={`${
            isSaving || name === workspace.name
              ? 'cursor-not-allowed opacity-50'
              : 'hover:border-blue-500/30 hover:bg-blue-500/20 dark:hover:border-blue-300/30 dark:hover:bg-blue-300/20'
          } col-span-full mt-2 flex w-full items-center justify-center rounded border border-blue-300/20 bg-blue-300/10 p-2 font-semibold text-blue-600 transition dark:text-blue-300`}
        >
          {isSaving ? t('common:saving') : t('common:save')}
        </Button>
      )}
    </div>
  );
}

const updateWorkspace = async (
  ws: Workspace,
  {
    onSuccess,
  }: {
    onSuccess?: () => void;
  }
) => {
  try {
    const res = await fetch(`/api/workspaces/${ws.id}`, {
      method: 'PUT',
      body: JSON.stringify(ws),
    });

    if (!res.ok) throw new Error('Failed to update workspace');
    else onSuccess?.();
  } catch (e) {
    // showNotification({
    //   title: 'Failed to update workspace',
    //   message: 'Make sure you have permission to update this workspace',
    //   color: 'red',
    // });
  }
};
