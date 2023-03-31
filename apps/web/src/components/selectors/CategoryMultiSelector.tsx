import { Squares2X2Icon } from '@heroicons/react/24/solid';
import { MultiSelect } from '@mantine/core';
import useSWR from 'swr';
import { ProductCategory } from '../../types/primitives/ProductCategory';
import { useWorkspaces } from '../../hooks/useWorkspaces';

interface Props {
  categoryIds: string[];
  setCategoryIds: (categoryIds: string[]) => void;
  className?: string;
}

const CategoryMultiSelector = ({
  categoryIds,
  setCategoryIds,
  className,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/inventory/categories`;
  const { data: categories } = useSWR<ProductCategory[]>(
    ws?.id ? apiPath : null
  );

  const data = [
    {
      label: 'Tất cả',
      value: '',
      group: 'Chung',
    },
    ...(categories?.map((category) => ({
      label: category.name,
      value: category.id,
      group: 'Danh mục',
    })) || []),
  ];

  const handleIdsChange = (ids: string[]) => {
    if (ids.length === 0) return setCategoryIds(['']);

    // Only allow either all, or multiple categories to be selected
    if (ids[0] === '') {
      if (ids.length === 1) {
        // "All" is selected, so clear all other selections
        setCategoryIds(ids);
        return;
      }

      // "All" is not selected, so remove it from the list
      setCategoryIds(ids.filter((id) => id !== ''));
    } else if (ids.length > 1 && ids.includes('')) {
      // Since "All" is selected, remove all other selections
      setCategoryIds(['']);
    } else {
      setCategoryIds(ids);
    }
  };

  return (
    <MultiSelect
      label="Danh mục"
      placeholder="Chọn danh mục"
      icon={<Squares2X2Icon className="h-5" />}
      data={data}
      value={categoryIds}
      onChange={handleIdsChange}
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
      disabled={!categories}
      searchable
    />
  );
};

export default CategoryMultiSelector;
