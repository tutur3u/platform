'use client';

import { Select } from '@mantine/core';
import { TransactionCategory } from '../../types/primitives/TransactionCategory';
import useSWR, { mutate } from 'swr';
import { useEffect } from 'react';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { showNotification } from '@mantine/notifications';
import useTranslation from 'next-translate/useTranslation';
import { useParams } from 'next/navigation';

interface Props {
  categoryId?: string | null;
  category?: TransactionCategory | null;
  setCategory?: (category: TransactionCategory | null) => void;

  blacklist?: string[];
  className?: string;

  preventPreselected?: boolean;
  showTransfer?: boolean;
  hideLabel?: boolean;

  isExpense?: boolean;
  disabled?: boolean;
  required?: boolean;
  clearable?: boolean;
  searchable?: boolean;
  creatable?: boolean;
}

const TransactionCategorySelector = ({
  categoryId: _categoryId,
  category,
  setCategory,

  blacklist = [],
  className,

  preventPreselected = false,
  showTransfer = false,
  hideLabel = false,

  isExpense,
  disabled = false,
  required = false,
  clearable = false,
  searchable = true,
  creatable = true,
}: Props) => {
  const params = useParams();
  const categoryId = params?.categoryId;

  const { ws } = useWorkspaces();

  const { t } = useTranslation('category-selector');

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/finance/transactions/categories?blacklist=${blacklist
        .filter((id) => id !== category?.id && id !== '')
        .join(',')}${isExpense !== undefined ? `&isExpense=${isExpense}` : ''}`
    : null;

  const { data: categories } = useSWR<TransactionCategory[]>(apiPath);

  const data = [
    ...(showTransfer
      ? [
          {
            label: t('transfer'),
            value: 'transfer',
            disabled: true,
          },
        ]
      : []),
    ...(categories?.map((category) => ({
      label: category.name || '',
      value: category.id || '',
      disabled: blacklist.includes(category?.id || ''),
    })) || []),
  ];

  useEffect(() => {
    if (!categories || !setCategory || category?.id) return;

    const id = _categoryId || categoryId;

    if (id && categories.find((v) => v.id === id)) {
      setCategory(categories.find((v) => v.id === id) || null);
      return;
    }

    if (preventPreselected) return;
    setCategory(categories?.[0]);
  }, [
    _categoryId,
    categoryId,
    category,
    categories,
    setCategory,
    preventPreselected,
  ]);

  const create = async ({
    category,
  }: {
    wsId: string;
    category: Partial<TransactionCategory>;
  }): Promise<TransactionCategory | null> => {
    if (!apiPath) return null;

    const res = await fetch(apiPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...category,
        is_expense: isExpense,
      } as TransactionCategory),
    });

    if (res.ok) {
      const { id } = await res.json();

      if (!id || typeof id !== 'string') {
        showNotification({
          title: t('common:error'),
          message: t('cannot-create-category'),
          color: 'red',
        });
        return null;
      }

      return { ...category, is_expense: isExpense, id };
    } else {
      showNotification({
        title: t('common:error'),
        message: t('cannot-create-category'),
        color: 'red',
      });
      return null;
    }
  };

  return (
    <Select
      label={hideLabel ? undefined : t('category')}
      placeholder={t('category-placeholder')}
      data={data}
      value={category?.id}
      onChange={(id) =>
        setCategory
          ? setCategory(categories?.find((v) => v.id === id) || null)
          : null
      }
      className={className}
      styles={{
        item: {
          // applies styles to selected item
          '&[data-selected]': {
            '&, &:hover': {
              backgroundColor: '#6b686b',
              color: '#fff',
              fontWeight: 600,
            },
          },

          // applies styles to hovered item
          '&:hover': {
            backgroundColor: '#454345',
            color: '#fff',
          },
        },
      }}
      getCreateLabel={(query) => (
        <div>
          + {t('create')} <span className="font-semibold">{query}</span>
        </div>
      )}
      onCreate={(query) => {
        if (!ws?.id) return null;

        create({
          wsId: ws.id,
          category: {
            name: query,
            is_expense: true,
          },
        }).then((item) => {
          if (!item) return null;

          mutate(apiPath, [...(categories || []), item]);
          if (setCategory) setCategory(item);

          return {
            label: item.name,
            value: item.id,
          };
        });
      }}
      nothingFound={t('nothing-found')}
      disabled={!categories || disabled}
      required={required}
      clearable={clearable}
      searchable={searchable}
      creatable={!!ws?.id && creatable}
    />
  );
};

export default TransactionCategorySelector;
