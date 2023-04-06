import { Select } from '@mantine/core';
import { TransactionCategory } from '../../types/primitives/TransactionCategory';
import useSWR from 'swr';
import { useEffect } from 'react';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useRouter } from 'next/router';

interface Props {
  categoryId?: string;
  category: TransactionCategory | null;
  setCategory: (category: TransactionCategory | null) => void;

  blacklist?: string[];
  className?: string;

  preventPreselected?: boolean;
  showTransfer?: boolean;
  hideLabel?: boolean;
  disabled?: boolean;
  required?: boolean;
  clearable?: boolean;
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
  disabled = false,
  required = false,
  clearable = false,
}: Props) => {
  const {
    query: { categoryId },
  } = useRouter();

  const { ws } = useWorkspaces();

  const apiPath = ws?.id
    ? `/api/workspaces/${
        ws?.id
      }/finance/transactions/categories?blacklist=${blacklist
        .filter((id) => id !== category?.id && id !== '')
        .join(',')}`
    : null;

  const { data: categorys } = useSWR<TransactionCategory[]>(apiPath);

  const data = [
    ...(showTransfer
      ? [
          {
            label: 'Chuyển tiền',
            value: 'transfer',
            disabled: true,
          },
        ]
      : []),
    ...(categorys?.map((category) => ({
      label: category.name,
      value: category.id,
      disabled: blacklist.includes(category.id),
    })) || []),
  ];

  useEffect(() => {
    if (!categorys || !setCategory || category?.id) return;

    const id = _categoryId || categoryId;

    if (id && categorys.find((v) => v.id === id)) {
      setCategory(categorys.find((v) => v.id === id) || null);
      return;
    }

    if (preventPreselected) return;
    setCategory(categorys?.[0]);
  }, [
    _categoryId,
    categoryId,
    category,
    categorys,
    setCategory,
    preventPreselected,
  ]);

  return (
    <Select
      label={hideLabel ? undefined : 'Danh mục giao dịch'}
      placeholder="Không có danh mục giao dịch"
      data={data}
      value={category?.id}
      onChange={(id) =>
        setCategory(categorys?.find((v) => v.id === id) || null)
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
      disabled={!categorys || disabled}
      required={required}
      clearable={clearable}
      searchable
    />
  );
};

export default TransactionCategorySelector;
