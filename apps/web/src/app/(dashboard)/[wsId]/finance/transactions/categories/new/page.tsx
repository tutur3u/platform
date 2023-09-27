'use client';

import { useState } from 'react';
import { Divider, Select, TextInput } from '@mantine/core';
import { openModal } from '@mantine/modals';
import SettingItemCard from '../../../../../../../components/settings/SettingItemCard';
import TransactionCategoryCreateModal from '../../../../../../../components/loaders/transactions/categories/TransactionCategoryCreateModal';
import { useLocalStorage } from '@mantine/hooks';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  params: {
    wsId: string;
  };
}

export default function NewTransactionCategoryPage({
  params: { wsId },
}: Props) {
  const { t } = useTranslation('categories');

  const [name, setName] = useState<string>('');

  const [isExpense, setIsExpense] = useLocalStorage<boolean>({
    key: 'new-transaction-category-is-expense',
    defaultValue: true,
  });

  const hasRequiredFields = () => name.length > 0;

  const showCreateModal = () => {
    openModal({
      title: <div className="font-semibold">{t('create-category')}</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <TransactionCategoryCreateModal
          wsId={wsId}
          category={{
            name,
            is_expense: isExpense,
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
            onClick={hasRequiredFields() ? showCreateModal : undefined}
          >
            {t('create')}
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
            placeholder={t('name-placeholder')}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </SettingItemCard>

        <SettingItemCard title={t('type')} description={t('type-description')}>
          <Select
            placeholder={t('type-placeholder')}
            value={isExpense ? 'expense' : 'income'}
            onChange={(e) => setIsExpense(e === 'expense')}
            data={[
              { label: t('expense'), value: 'expense' },
              { label: t('income'), value: 'income' },
            ]}
          />
        </SettingItemCard>

        <SettingItemCard
          title={t('icon')}
          description={t('icon-description')}
          disabled
          comingSoon
        />
      </div>
    </div>
  );
}
