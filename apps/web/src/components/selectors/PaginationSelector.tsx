import { Squares2X2Icon } from '@heroicons/react/24/solid';
import { Select } from '@mantine/core';

export type Mode = 'list' | 'grid';

interface Props {
  items: number;
  setItems: (items: number) => void;
}

const PaginationSelector = ({ items, setItems }: Props) => {
  const data = [
    {
      label: '1 mục',
      value: '1',
    },
    {
      label: '3 mục',
      value: '3',
    },
    {
      label: '7 mục',
      value: '7',
    },
    {
      label: '11 mục',
      value: '11',
    },
    {
      label: '15 mục',
      value: '15',
    },
    {
      label: '35 mục',
      value: '35',
    },
    {
      label: '55 mục',
      value: '55',
    },
    {
      label: '75 mục',
      value: '75',
    },
    {
      label: '95 mục',
      value: '95',
    },
  ];

  return (
    <Select
      label="Số mục trên trang"
      placeholder="Chọn số mục trên trang"
      icon={<Squares2X2Icon className="h-5" />}
      data={data}
      value={items.toString()}
      onChange={(value) => {
        setItems(parseInt(value || '15'));
      }}
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
    />
  );
};

export default PaginationSelector;
