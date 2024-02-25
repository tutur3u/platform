import { Select } from '@mantine/core';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import useSWR, { mutate } from 'swr';
import { useEffect } from 'react';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { showNotification } from '@mantine/notifications';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  userId: string;
  setUserId: (userId: string) => void;

  label?: string;
  placeholder?: string;

  className?: string;

  mode?: 'platform' | 'workspace';
  notEmpty?: boolean;
  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  creatable?: boolean;
  clearable?: boolean;
  preventPreselect?: boolean;
}

const WorkspaceUserSelector = ({
  userId,
  setUserId,

  label,
  placeholder,

  className,

  mode = 'workspace',
  notEmpty = false,
  disabled = false,
  required = false,
  searchable = true,
  creatable = true,
  clearable = false,
  preventPreselect = false,
}: Props) => {
  const { ws } = useWorkspaces();

  const { t } = useTranslation('ws-selector');

  const apiPath = ws?.id
    ? mode === 'workspace'
      ? `/api/workspaces/${ws.id}/users`
      : `/api/users`
    : null;

  const { data: fetchedData } = useSWR<{
    data: WorkspaceUser[];
    count: number;
  }>(apiPath);

  const users = fetchedData?.data;

  const data = (
    notEmpty
      ? [
          ...(users?.map((user) => ({
            label: user?.name ?? user?.display_name ?? user?.handle ?? '',
            value: user.id,
          })) || []),
        ]
      : [
          {
            label: t('passersby'),
            value: '',
            group: t('common:general'),
          },
          ...(users?.map((user) => ({
            label: user?.name ?? user?.display_name ?? user?.handle ?? '',
            value: user.id,
            group: t('common:other'),
          })) || []),
        ]
  ).filter((item) => item.label);

  useEffect(() => {
    if (!users || preventPreselect) return;

    if (users.length === 1) setUserId(users[0].id);
    else if (userId && !users?.find((p) => p.id === userId)) setUserId('');
  }, [preventPreselect, userId, users, setUserId]);

  const create = async ({
    warehouse,
  }: {
    wsId: string;
    warehouse: Partial<WorkspaceUser>;
  }): Promise<WorkspaceUser | null> => {
    if (!apiPath) return null;

    const res = await fetch(apiPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(warehouse),
    });

    if (res.ok) {
      const { id } = await res.json();

      if (!id || typeof id !== 'string') {
        showNotification({
          title: t('common:error'),
          message: t('cannot-create-user'),
          color: 'red',
        });
        return null;
      }

      return { ...warehouse, id };
    } else {
      showNotification({
        title: t('common:error'),
        message: t('cannot-create-user'),
        color: 'red',
      });
      return null;
    }
  };

  return (
    <Select
      label={label ?? t('user')}
      placeholder={placeholder ?? t('user-placeholder')}
      data={data}
      value={userId}
      onChange={setUserId}
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
      getCreateLabel={(query) => (
        <div>
          + {t('create')} <span className="font-semibold">{query}</span>
        </div>
      )}
      onCreate={(query) => {
        if (!ws?.id) return null;

        create({
          wsId: ws.id,
          warehouse: {
            name: query,
          },
        }).then((item) => {
          if (!item) return null;

          mutate(apiPath, [...(users || []), item]);
          setUserId(item.id);

          return {
            label: item.name,
            value: item.id,
          };
        });
      }}
      nothingFound={t('nothing-found')}
      disabled={!users || disabled}
      required={required}
      searchable={searchable}
      creatable={!!ws?.id && creatable}
      clearable={clearable}
    />
  );
};

export default WorkspaceUserSelector;
