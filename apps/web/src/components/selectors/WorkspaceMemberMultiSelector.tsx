import { UserCircleIcon } from '@heroicons/react/24/solid';
import { MultiSelect } from '@mantine/core';
import useSWR from 'swr';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { User } from '../../types/primitives/User';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  userIds: string[];
  setUserIds: (userIds: string[]) => void;
  className?: string;
}

const WorkspaceMemberMultiSelector = ({
  userIds,
  setUserIds,
  className,
}: Props) => {
  const { ws } = useWorkspaces();
  const { t } = useTranslation('ws-members');

  const apiPath = `/api/workspaces/${ws?.id}/members`;
  const { data: users } = useSWR<User[]>(ws?.id ? apiPath : null);

  const data = [
    {
      label: t('all'),
      value: '',
      group: t('common:general'),
    },
    ...(users?.map((u) => ({
      label: u?.display_name || u?.handle || u?.email || u?.id,
      value: u.id,
      group: t('members'),
    })) || []),
  ];

  const handleIdsChange = (ids: string[]) => {
    if (ids.length === 0) return setUserIds(['']);

    // Only allow either all, or multiple categories to be selected
    if (ids[0] === '') {
      if (ids.length === 1) {
        // "All" is selected, so clear all other selections
        setUserIds(ids);
        return;
      }

      // "All" is not selected, so remove it from the list
      setUserIds(ids.filter((id) => id !== ''));
    } else if (ids.length > 1 && ids.includes('')) {
      // Since "All" is selected, remove all other selections
      setUserIds(['']);
    } else {
      setUserIds(ids);
    }
  };

  return (
    <MultiSelect
      label={t('members')}
      placeholder={t('select-members')}
      icon={<UserCircleIcon className="h-5" />}
      data={data}
      value={userIds.length > 0 ? userIds : ['']}
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
      disabled={!users}
      searchable
    />
  );
};

export default WorkspaceMemberMultiSelector;
