'use client';

import { useEffect, useState } from 'react';
import { Divider, TextInput } from '@mantine/core';
import SettingItemCard from '@/components/settings/SettingItemCard';
import { UserGroup } from '@/types/primitives/UserGroup';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';
import { useAppearance } from '@/hooks/useAppearance';

interface Props {
  params: {
    wsId: string;
    groupId: string;
  };
}

export default function UserGroupSettingsPage({
  params: { wsId, groupId },
}: Props) {
  const { t } = useTranslation('ws-user-groups-details');

  const { sidebar } = useAppearance();

  const apiPath =
    wsId && groupId ? `/api/workspaces/${wsId}/users/groups/${groupId}` : null;

  const { data: group } = useSWR<UserGroup>(apiPath);

  const [name, setName] = useState<string>('');

  useEffect(() => {
    if (!group) return;
    setName(group?.name || '');
  }, [group]);

  const hasRequiredFields = () => name.length > 0;

  const reset = () => {
    if (!group) return;
    setName(group?.name || '');
  };

  const isDirty = () => {
    if (!group) return false;
    return name !== group?.name;
  };

  return (
    <div className="flex min-h-full w-full flex-col ">
      {group && hasRequiredFields() && (
        <div
          className={`fixed inset-x-0 ${
            sidebar === 'open'
              ? 'mx-4 md:ml-72 md:mr-8 lg:ml-80 lg:mr-16 xl:ml-96 xl:mr-32'
              : 'mx-4 md:ml-24 md:mr-8 lg:ml-32 lg:mr-16 xl:mx-48'
          } border-border bottom-0 z-[100] mx-4 mb-[4.5rem] flex flex-col items-center justify-between gap-y-4 rounded-lg border bg-zinc-500/5 p-4 backdrop-blur transition-all duration-500 md:mx-8 md:mb-4 md:flex-row lg:mx-16 xl:mx-32 dark:border-zinc-300/10 dark:bg-zinc-900/80 ${
            isDirty() ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div>{t('common:unsaved-changes')}</div>

          <div className="flex w-full items-center gap-4 md:w-fit">
            <button
              className={`w-full font-semibold text-zinc-700 transition md:w-fit dark:text-zinc-300 ${
                isDirty()
                  ? ''
                  : 'pointer-events-none cursor-not-allowed opacity-50'
              }`}
              onClick={reset}
            >
              {t('common:reset')}
            </button>

            <button
              className={`w-full rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition md:w-fit dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 ${
                isDirty()
                  ? 'hover:bg-blue-300/20'
                  : 'pointer-events-none cursor-not-allowed opacity-50'
              }`}
            >
              {t('common:save')}
            </button>
          </div>
        </div>
      )}

      <div className="grid h-fit gap-4 pb-32 md:grid-cols-2 xl:grid-cols-3">
        <div className="col-span-full">
          <div className="text-2xl font-semibold">{t('basic-info')}</div>
          <Divider className="my-2" variant="dashed" />
        </div>

        <SettingItemCard title={t('name')} description={t('name-description')}>
          <TextInput
            placeholder={t('enter-name')}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
          />
        </SettingItemCard>

        <SettingItemCard
          title={t('security')}
          description={t('security-description')}
        />
      </div>
    </div>
  );
}
