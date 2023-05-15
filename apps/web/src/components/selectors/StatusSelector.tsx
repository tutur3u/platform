import { Squares2X2Icon } from '@heroicons/react/24/solid';
import { Select } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  status: string;
  setStatus: (status: string) => void;
  preset: 'completion' | 'status';
}

const StatusSelector = ({ status, setStatus, preset }: Props) => {
  const { t } = useTranslation('status-selector');

  const data =
    preset === 'status'
      ? [
          {
            label: t('all'),
            value: '',
          },
          {
            label: t('active'),
            value: 'active',
          },
          {
            label: t('inactive'),
            value: 'inactive',
          },
        ]
      : [
          {
            label: t('all'),
            value: '',
          },
          {
            label: t('completed'),
            value: 'completed',
          },
          {
            label: t('incomplete'),
            value: 'incomplete',
          },
        ];

  return (
    <Select
      label={t('status')}
      placeholder={t('status-placeholder')}
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
