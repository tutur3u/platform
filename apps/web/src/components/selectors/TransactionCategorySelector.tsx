import { Select } from '@mantine/core';
import { TransactionCategory } from '../../types/primitives/TransactionCategory';
import useSWR from 'swr';
import { useEffect } from 'react';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useRouter } from 'next/router';

interface Props {
  category: TransactionCategory | null;
  setCategory: (category: TransactionCategory | null) => void;

  blacklist?: string[];

  softDisabled?: boolean;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

const TransactionCategorySelector = ({
  category,
  setCategory,

  blacklist = [],

  className,

  disabled = false,
  required = false,
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
    ...(categorys?.map((category) => ({
      label: category.name,
      value: category.id,
      disabled: blacklist.includes(category.id),
    })) || []),
  ];

  useEffect(() => {
    if (!categorys || !setCategory || category?.id) return;

    if (categoryId && categorys.find((v) => v.id === categoryId)) {
      setCategory(categorys.find((v) => v.id === categoryId) || null);
      return;
    }

    if (categorys.length === 1) setCategory(categorys[0]);
  }, [categoryId, category, categorys, setCategory]);

  return (
    <Select
      label="Danh mục giao dịch"
      placeholder="Chọn danh mục giao dịch"
      data={data}
      value={category?.id}
      onChange={(id) =>
        setCategory(categorys?.find((v) => v.id === id) || null)
      }
      className={className}
      classNames={{
        input:
          'bg-[#3f3a3a]/30 border-zinc-300/20 focus:border-zinc-300/20 border-zinc-300/20 font-semibold',
        dropdown: 'bg-[#323030]',
      }}
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
      searchable
    />
  );
};

export default TransactionCategorySelector;
