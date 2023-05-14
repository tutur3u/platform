import { Squares2X2Icon } from '@heroicons/react/24/solid';
import { Select } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';

export type Mode = 'list' | 'grid';

interface Props {
  mode: Mode;
  setMode: (mode: Mode) => void;
  showAll?: boolean;
}

const ModeSelector = ({ mode, setMode, showAll = false }: Props) => {
  const { t } = useTranslation('view-mode');

  const data = showAll
    ? [
        {
          label: t('list_view'),
          value: 'list',
        },
        {
          label: t('grid_view'),
          value: 'grid',
        },
      ]
    : mode === 'list'
    ? [
        {
          label: t('list_view'),
          value: 'list',
        },
      ]
    : [
        {
          label: t('grid_view'),
          value: 'grid',
        },
      ];

  return (
    <Select
      label={t('view_mode')}
      placeholder={t('select_view_mode')}
      icon={<Squares2X2Icon className="h-5" />}
      data={data}
      value={mode}
      onChange={setMode}
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
