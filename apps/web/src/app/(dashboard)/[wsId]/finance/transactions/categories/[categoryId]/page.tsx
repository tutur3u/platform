'use client';

import { useEffect, useState } from 'react';
import { Divider, Select, TextInput } from '@mantine/core';
import { openModal } from '@mantine/modals';
import SettingItemCard from '../../../../../../../components/settings/SettingItemCard';
import TransactionCategoryDeleteModal from '../../../../../../../components/loaders/transactions/categories/TransactionCategoryDeleteModal';
import TransactionCategoryEditModal from '../../../../../../../components/loaders/transactions/categories/TransactionCategoryEditModal';
import { TransactionCategory } from '../../../../../../../types/primitives/TransactionCategory';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  params: {
    wsId: string;
    categoryId: string;
  };
}

export default function TransactionCategoryDetailsPage({
  params: { wsId, categoryId },
}: Props) {
  const { t } = useTranslation('categories');

  const apiPath =
    wsId && categoryId
      ? `/api/workspaces/${wsId}/finance/transactions/categories/${categoryId}`
      : null;

  const { data: category } = useSWR<TransactionCategory>(apiPath);

  const [name, setName] = useState<string>('');
  const [isExpense, setIsExpense] = useState<boolean | null>(null);

  useEffect(() => {
    if (!category) return;

    setName(category?.name || '');
    setIsExpense(category?.is_expense ?? null);
  }, [category]);

  const hasRequiredFields = () => name.length > 0;

  const showEditModal = () => {
    if (!category || isExpense === null) return;
    if (typeof categoryId !== 'string') return;

    openModal({
      title: <div className="font-semibold">{t('update-category')}</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <TransactionCategoryEditModal
          wsId={wsId}
          category={{
            id: categoryId,
            name,
            is_expense: isExpense,
          }}
        />
      ),
    });
  };

  const showDeleteModal = () => {
    if (!category) return;
    if (typeof categoryId !== 'string') return;

    openModal({
      title: <div className="font-semibold">{t('delete-category')}</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <TransactionCategoryDeleteModal wsId={wsId} categoryId={categoryId} />
      ),
    });
  };

  return (
    <div className="mt-2 flex min-h-full w-full flex-col ">
      <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
        <div className="flex items-end justify-end gap-2">
          <button
            className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
              category ? 'hover:bg-red-300/20' : 'cursor-not-allowed opacity-50'
            }`}
            onClick={category ? showDeleteModal : undefined}
          >
            {t('delete')}
          </button>

          <button
            className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
              hasRequiredFields()
                ? 'hover:bg-blue-300/20'
                : 'cursor-not-allowed opacity-50'
            }`}
            onClick={hasRequiredFields() ? showEditModal : undefined}
          >
            {t('save-changes')}
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
            placeholder={category?.name || t('name-placeholder')}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            disabled={!category}
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
            disabled={!category}
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
