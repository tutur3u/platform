import { Button, Timeline } from '@mantine/core';
import { useState } from 'react';
import { CheckBadgeIcon, TrashIcon } from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import { useRouter } from 'next/router';
import { Status } from '../../status';
import { useCalendar } from '../../../../hooks/useCalendar';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  wsId: string;
  eventId: string;
}

interface Progress {
  removed: Status;
}

const CalendarEventDeleteModal = ({ wsId, eventId }: Props) => {
  const router = useRouter();

  const { t } = useTranslation('calendar-event-delete-form');
  const { refresh } = useCalendar();

  const [progress, setProgress] = useState<Progress>({
    removed: 'idle',
  });

  const hasError = progress.removed === 'error';
  const hasSuccess = progress.removed === 'success';

  const removeDetails = async () => {
    const res = await fetch(
      `/api/workspaces/${wsId}/calendar/events/${eventId}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      await refresh();

      setProgress((progress) => ({ ...progress, removed: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể xoá sự kiện',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, removed: 'error' }));
      return false;
    }
  };

  const handleDelete = async () => {
    if (!eventId) return;

    setProgress((progress) => ({ ...progress, removed: 'loading' }));
    removeDetails();
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={progress.removed === 'success' ? 1 : 0}
        bulletSize={32}
        lineWidth={4}
        color={started ? 'green' : 'gray'}
        className="mt-2"
      >
        <Timeline.Item
          bullet={<TrashIcon className="h-5 w-5" />}
          title={t('delete-event')}
        >
          {progress.removed === 'success' ? (
            <div className="text-green-300">{t('delete-event')}</div>
          ) : progress.removed === 'error' ? (
            <div className="text-red-300">{t('cant-delete-event')}</div>
          ) : progress.removed === 'loading' ? (
            <div className="text-blue-300">{t('deleting-event')}</div>
          ) : (
            <div className="text-zinc-400/80">{t('pending-event-delete')}</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title={t('common:complete')}
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.removed === 'success' ? (
            <div className="text-green-300">{t('common:completed')}</div>
          ) : hasError ? (
            <div className="text-red-300">{t('common:cancel-completed')}</div>
          ) : (
            <div className="text-zinc-400/80">
              {t('common:pending-completion')}
            </div>
          )}
        </Timeline.Item>
      </Timeline>

      <div className="mt-4 flex justify-end gap-2">
        {started || (
          <Button
            className="rounded border border-zinc-300/10 bg-zinc-300/10 px-4 py-1 font-semibold text-zinc-300 transition hover:bg-zinc-300/20"
            onClick={() => closeAllModals()}
          >
            {t('common:cancel')}
          </Button>
        )}

        <Button
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
              router.push(`/${wsId}/calendar/events`);
              closeAllModals();
              return;
            }

            if (!started) {
              setStarted(true);
              handleDelete();
            }
          }}
        >
          {hasError
            ? t('common:return')
            : hasSuccess
            ? t('common:complete')
            : started
            ? t('common:creating')
            : t('common:start')}
        </Button>
      </div>
    </>
  );
};

export default CalendarEventDeleteModal;
