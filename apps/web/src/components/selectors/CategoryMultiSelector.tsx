import { Squares2X2Icon } from '@heroicons/react/24/solid';
import { MultiSelect } from '@mantine/core';
import useSWR from 'swr';
import { ProductCategory } from '../../types/primitives/ProductCategory';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import useTranslation from 'next-translate/useTranslation';

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
  const { t } = useTranslation('category-multi-selector');
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/inventory/categories`;
  const { data: categories } = useSWR<{
    data: ProductCategory[];
    count: number;
  }>(ws?.id ? apiPath : null);

  const data = [
    {
      label: t('common:all'),
      value: '',
      group: t('common:general'),
    },
    ...(categories?.data.map((category) => ({
      label: category.name,
      value: category.id,
      group: t('categories'),
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
      label={t('category')}
      placeholder={t('select-categories')}
      icon={<Squares2X2Icon className="h-5" />}
      data={data}
      value={categoryIds.length > 0 ? categoryIds : ['']}
      onChange={handleIdsChange}
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
      disabled={!categories}
      searchable
    />
  );
};

export default CategoryMultiSelector;
