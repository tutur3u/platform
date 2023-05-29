import { ListBulletIcon } from '@heroicons/react/24/solid';
import { Select } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';

export type Mode = 'list' | 'grid';

interface Props {
  items: number;
  setItems: (items: number) => void;
  options?: number[];
}

const PaginationSelector = ({ items, setItems, options }: Props) => {
  const { t } = useTranslation('pagination');

  const data = (options ?? [1, 3, 7, 11, 15, 35, 55, 75, 95]).map((val) => ({
    value: val.toString(),
    label: `${val} ${t('items')}`,
  }));

  return (
    <Select
      label={t('items_per_page')}
      placeholder={t('select_items_per_page')}
      icon={<ListBulletIcon className="h-5" />}
      data={data}
      value={items.toString()}
      onChange={(value) => {
        setItems(parseInt(value || '15'));
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
    />
  );
};

export default PaginationSelector;
