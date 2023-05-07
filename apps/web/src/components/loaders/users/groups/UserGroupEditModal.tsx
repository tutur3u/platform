import { Timeline } from '@mantine/core';
import { useState } from 'react';
import { CheckBadgeIcon, PlusIcon } from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import { useRouter } from 'next/router';
import { mutate } from 'swr';
import { Status } from '../../status';
import { UserGroup } from '../../../../types/primitives/UserGroup';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  wsId: string;
  group: UserGroup;
}

interface Progress {
  updated: Status;
}

const UserGroupEditModal = ({ wsId, group }: Props) => {
  const { t } = useTranslation('ws-users-groups-details');

  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    updated: 'idle',
  });

  const hasError = progress.updated === 'error';
  const hasSuccess = progress.updated === 'success';

  const updateDetails = async () => {
    const res = await fetch(
      `/api/workspaces/${wsId}/users/groups/${group.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(group),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({ ...progress, updated: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: t('common:error'),
        message: t('cant-update'),
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, updated: 'error' }));
      return false;
    }
  };

  const handleEdit = async () => {
    if (!group.id) return;

    setProgress((progress) => ({ ...progress, updated: 'loading' }));
    await updateDetails();
    mutate(`/api/workspaces/${wsId}/users/groups/${group.id}`);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={progress.updated === 'success' ? 1 : 0}
        bulletSize={32}
        lineWidth={4}
        color={started ? 'green' : 'gray'}
        className="mt-2"
      >
        <Timeline.Item
          bullet={<PlusIcon className="h-5 w-5" />}
          title={t('update-user-group')}
        >
          {progress.updated === 'success' ? (
            <div className="text-green-300">{t('updated-success')}</div>
          ) : progress.updated === 'error' ? (
            <div className="text-red-300">{t('cant-update')}</div>
          ) : progress.updated === 'loading' ? (
            <div className="text-blue-300">{t('updating')}</div>
          ) : (
            <div className="text-zinc-400/80">{t('update-pending')}</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title={t('common:complete')}
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.updated === 'success' ? (
            <div className="text-green-300">{t('completed')}</div>
          ) : hasError ? (
            <div className="text-red-300">{t('completion-cancelled')}</div>
          ) : (
            <div className="text-zinc-400/80">{t('completion-pending')}</div>
          )}
        </Timeline.Item>
      </Timeline>

      <div className="mt-4 flex justify-end gap-2">
        {started || (
          <button
            className="rounded border border-zinc-300/10 bg-zinc-300/10 px-4 py-1 font-semibold text-zinc-300 transition hover:bg-zinc-300/20"
            onClick={() => closeAllModals()}
          >
            {t('common:cancel')}
          </button>
        )}

        {group.id && hasSuccess && (
          <button
            className="rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition hover:bg-blue-300/20"
            onClick={() => closeAllModals()}
          >
            {t('view-group')}
          </button>
        )}

        <button
          className={`rounded border px-4 py-1 font-semibold transition ${
            hasError
              ? 'border-red-300/10 bg-red-300/10 text-red-300 hover:bg-red-300/20'
              : hasSuccess
              ? 'border-green-300/10 bg-green-300/10 text-green-300 hover:bg-green-300/20'
              : started
              ? 'cursor-not-allowed border-zinc-300/10 bg-zinc-300/10 text-zinc-300/50'
              : 'border-blue-300/10 bg-blue-300/10 text-blue-300 hover:bg-blue-300/20'
          }`}
          onClick={() => {
            if (hasError) {
              closeAllModals();
              return;
            }

            if (hasSuccess) {
              router.push(`/${wsId}/users/groups`);
              closeAllModals();
              return;
            }

            if (!started) {
              setStarted(true);
              handleEdit();
            }
          }}
        >
          {hasError
            ? t('common:back')
            : hasSuccess
            ? t('common:complete')
            : started
            ? t('common:processing')
            : t('common:start')}
        </button>
      </div>
    </>
  );
};

export default UserGroupEditModal;
