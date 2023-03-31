import { Squares2X2Icon } from '@heroicons/react/24/solid';
import { Select } from '@mantine/core';

export type Mode = 'list' | 'grid';

interface Props {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

const ModeSelector = ({ mode, setMode }: Props) => {
  const data = [
    {
      label: 'Dạng danh sách',
      value: 'list',
    },
    {
      label: 'Dạng lưới',
      value: 'grid',
    },
  ];

  return (
    <Select
      label="Chế độ xem"
      placeholder="Chọn chế độ xem"
      icon={<Squares2X2Icon className="h-5" />}
      data={data}
      value={mode}
      onChange={setMode}
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

export default ModeSelector;
