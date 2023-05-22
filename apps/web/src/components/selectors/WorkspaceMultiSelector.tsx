import { UserCircleIcon } from '@heroicons/react/24/solid';
import { MultiSelect } from '@mantine/core';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';
import { Workspace } from '../../types/primitives/Workspace';
import { useUser } from '@supabase/auth-helpers-react';

interface Props {
  wsIds: string[];
  setWsIds: (wsIds: string[]) => void;
  className?: string;
}

const WorkspaceMultiSelector = ({ wsIds, setWsIds, className }: Props) => {
  const user = useUser();
  const { t } = useTranslation('ws-multi-selector');

  const apiPath = `/api/workspaces/current`;
  const { data: workspaces } = useSWR<Workspace[]>(user?.id ? apiPath : null);

  const data = [
    {
      label: t('common:all'),
      value: '',
      group: t('common:general'),
    },
    ...(Array.isArray(workspaces)
      ? workspaces?.map((u) => ({
          label: u?.name || u?.handle || u?.id,
          value: u.id,
          group: t('workspaces'),
        })) || []
      : []),
  ];

  const handleIdsChange = (ids: string[]) => {
    if (ids.length === 0) return setWsIds(['']);

    // Only allow either all, or multiple categories to be selected
    if (ids[0] === '') {
      if (ids.length === 1) {
        // "All" is selected, so clear all other selections
        setWsIds(ids);
        return;
      }

      // "All" is not selected, so remove it from the list
      setWsIds(ids.filter((id) => id !== ''));
    } else if (ids.length > 1 && ids.includes('')) {
      // Since "All" is selected, remove all other selections
      setWsIds(['']);
    } else {
      setWsIds(ids);
    }
  };

  return (
    <MultiSelect
      label={t('workspaces')}
      placeholder={t('select_workspaces')}
      icon={<UserCircleIcon className="h-5" />}
      data={data}
      value={wsIds.length > 0 ? wsIds : ['']}
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
      disabled={!workspaces}
      searchable
    />
  );
};

export default WorkspaceMultiSelector;
