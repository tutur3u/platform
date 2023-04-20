import { Squares2X2Icon } from '@heroicons/react/24/solid';
import { Select } from '@mantine/core';

interface Props {
  status: string;
  setStatus: (status: string) => void;
  preset: 'completion' | 'status';
}

const StatusSelector = ({ status, setStatus, preset }: Props) => {
  const data =
    preset === 'status'
      ? [
          {
            label: 'Tất cả',
            value: '',
          },
          {
            label: 'Đang hoạt động',
            value: 'active',
          },
          {
            label: 'Ngưng hoạt động',
            value: 'inactive',
          },
        ]
      : [
          {
            label: 'Tất cả',
            value: '',
          },
          {
            label: 'Đã hoàn thành',
            value: 'completed',
          },
          {
            label: 'Chưa hoàn thành',
            value: 'incomplete',
          },
        ];

  return (
    <Select
      label="Trạng thái"
      placeholder="Chọn trạng thái"
      icon={<Squares2X2Icon className="h-5" />}
      data={data}
      value={status}
      onChange={setStatus}
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

export default StatusSelector;
