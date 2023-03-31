import { Select } from '@mantine/core';
import { ProductCategory } from '../../types/primitives/ProductCategory';
import useSWR from 'swr';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useEffect } from 'react';

interface Props {
  categoryId: string;
  setCategoryId: (categoryId: string) => void;

  required?: boolean;
}

const CategorySelector = ({
  categoryId,
  setCategoryId,

  required = false,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/inventory/categories`;
  const { data: categories } = useSWR<ProductCategory[]>(
    ws?.id ? apiPath : null
  );

  const data = [
    ...(categories?.map((category) => ({
      label: category.name,
      value: category.id,
    })) || []),
  ];

  useEffect(() => {
    if (!categories) return;

    if (categories.length === 1) setCategoryId(categories[0].id);
    else if (categoryId && !categories?.find((p) => p.id === categoryId))
      setCategoryId('');
  }, [categoryId, categories, setCategoryId]);

  return (
    <Select
      label="Danh mục"
      placeholder="Chọn danh mục"
      data={data}
      value={categoryId}
      onChange={setCategoryId}
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
      disabled={!categories}
      searchable
      required={required}
    />
  );
};

export default CategorySelector;
