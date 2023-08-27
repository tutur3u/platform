'use client';

import { useState } from 'react';
import { Divider, TextInput } from '@mantine/core';
import { openModal } from '@mantine/modals';
import useTranslation from 'next-translate/useTranslation';
import SettingItemCard from '@/components/settings/SettingItemCard';
import UserGroupCreateModal from '@/components/loaders/users/groups/UserGroupCreateModal';

interface Props {
  params: {
    wsId: string;
  };
}

export default function NewRolePage({ params: { wsId } }: Props) {
  const { t } = useTranslation('ws-user-groups-details');

  const createNewGroupLabel = t('create-new-group');

  const [name, setName] = useState<string>('');

  const hasRequiredFields = () => name.length > 0;

  const showLoaderModal = () => {
    openModal({
      title: <div className="font-semibold">{createNewGroupLabel}</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <UserGroupCreateModal
          wsId={wsId}
          group={{
            name,
          }}
        />
      ),
    });
  };

  return (
    <div className="mt-2 flex min-h-full w-full flex-col ">
      <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
        <div className="flex items-end justify-end">
          <button
            className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
              hasRequiredFields()
                ? 'hover:bg-blue-300/20'
                : 'cursor-not-allowed opacity-50'
            }`}
            onClick={hasRequiredFields() ? showLoaderModal : undefined}
          >
            {t('common:create')}
          </button>
        </div>
      </div>

      <Divider className="my-4" />
      <div className="grid h-fit gap-4 md:grid-cols-2 xl:grid-cols-3">
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
      </div>
    </div>
  );
}
