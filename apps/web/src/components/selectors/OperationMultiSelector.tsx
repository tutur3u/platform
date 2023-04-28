import { WrenchScrewdriverIcon } from '@heroicons/react/24/solid';
import { MultiSelect } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  ops: string[];
  setOps: (ops: string[]) => void;
  className?: string;
}

const OperationMultiSelector = ({ ops, setOps, className }: Props) => {
  const { t } = useTranslation('crud-ops');

  const data = [
    {
      label: t('common:all'),
      value: '',
      group: t('common:general'),
    },
    {
      label: t('insert'),
      value: 'INSERT',
      group: t('common:other'),
    },
    {
      label: t('update'),
      value: 'UPDATE',
      group: t('common:other'),
    },
    {
      label: t('delete'),
      value: 'DELETE',
      group: t('common:other'),
    },
  ];

  const handleIdsChange = (ids: string[]) => {
    if (ids.length === 0) return setOps(['']);

    // Only allow either all, or multiple categories to be selected
    if (ids[0] === '') {
      if (ids.length === 1) {
        // "All" is selected, so clear all other selections
        setOps(ids);
        return;
      }

      // "All" is not selected, so remove it from the list
      setOps(ids.filter((id) => id !== ''));
    } else if (ids.length > 1 && ids.includes('')) {
      // Since "All" is selected, remove all other selections
      setOps(['']);
    } else {
      setOps(ids);
    }
  };

  return (
    <MultiSelect
      label={t('ops')}
      placeholder={t('select-ops')}
      icon={<WrenchScrewdriverIcon className="h-5" />}
      data={data}
      value={ops.length > 0 ? ops : ['']}
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
      searchable
    />
  );
};

export default OperationMultiSelector;
