import { Timeline } from '@mantine/core';
import { useState } from 'react';
import { CheckBadgeIcon, PlusIcon } from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Status } from '../../status';
import { UserGroup } from '../../../../types/primitives/UserGroup';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  wsId: string;
  group: Partial<UserGroup>;
}

interface Progress {
  created: Status;
}

const UserGroupCreateModal = ({ wsId, group }: Props) => {
  const { t } = useTranslation('ws-user-groups-details');

  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    created: 'idle',
  });

  const hasError = progress.created === 'error';
  const hasSuccess = progress.created === 'success';

  const createUserGroup = async () => {
    const res = await fetch(`/api/workspaces/${wsId}/users/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(group),
    });

    if (res.ok) {
      setProgress((progress) => ({ ...progress, created: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: t('common:error'),
        message: t('cant-create'),
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, created: 'error' }));
      return false;
    }
  };

  const [categoryId, setUserGroupId] = useState<string | null>(null);

  const handleCreate = async () => {
    setProgress((progress) => ({ ...progress, created: 'loading' }));
    const categoryId = await createUserGroup();
    if (categoryId) setUserGroupId(categoryId);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={progress.created === 'success' ? 1 : 0}
        bulletSize={32}
        lineWidth={4}
        color={started ? 'green' : 'gray'}
        className="mt-2"
      >
        <Timeline.Item
          bullet={<PlusIcon className="h-5 w-5" />}
          title={t('create-user-group')}
        >
          {progress.created === 'success' ? (
            <div className="text-green-300">{t('created-success')}</div>
          ) : progress.created === 'error' ? (
            <div className="text-red-300">{t('cant-create')}</div>
          ) : progress.created === 'loading' ? (
            <div className="text-blue-300">{t('creating')}</div>
          ) : (
            <div className="text-zinc-400/80">{t('creation-pending')}</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title={t('common:complete')}
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.created === 'success' ? (
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

        {categoryId && (hasError || hasSuccess) && (
          <Link
            href={`/${wsId}/groups/${categoryId}`}
            onClick={() => closeAllModals()}
            className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
          >
            {t('view-group')}
          </Link>
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
              handleCreate();
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

export default UserGroupCreateModal;
