import { Button, Timeline } from '@mantine/core';
import { useState } from 'react';
import { ArrowPathIcon, CheckBadgeIcon } from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import { useRouter } from 'next/router';
import { Status } from '../../status';
import { CalendarEvent } from '../../../../types/primitives/CalendarEvent';
import { useCalendar } from '../../../../hooks/useCalendar';
import useTranslation from 'next-translate/useTranslation';
import { mutate } from 'swr';

interface Props {
  wsId: string;
  oldEvent: CalendarEvent;
  event: CalendarEvent;
}

interface Progress {
  updated: Status;
}

const CalendarEventEditModal = ({ wsId, event }: Props) => {
  const router = useRouter();

  const { t } = useTranslation('calendar-event-edit-form');
  const { refresh } = useCalendar();

  const [progress, setProgress] = useState<Progress>({
    updated: 'idle',
  });

  const hasError = progress.updated === 'error';
  const hasSuccess = progress.updated === 'success';

  const updateDetails = async () => {
    const res = await fetch(
      `/api/workspaces/${wsId}/calendar/events/${event.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (res.ok) {
      mutate(`/api/workspaces/${wsId}/calendar/events/${event.id}`, event);
      await refresh();

      setProgress((progress) => ({ ...progress, updated: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể cập nhật sự kiện',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, updated: 'error' }));
      return false;
    }
  };

  const handleEdit = async () => {
    if (!event.id) return;

    setProgress((progress) => ({ ...progress, updated: 'loading' }));
    updateDetails();
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
          bullet={<ArrowPathIcon className="h-5 w-5" />}
          title={t('update-event')}
        >
          {progress.updated === 'success' ? (
            <div className="text-green-300">{t('update-event')}</div>
          ) : progress.updated === 'error' ? (
            <div className="text-red-300">{t('cant-update-event')}</div>
          ) : progress.updated === 'loading' ? (
            <div className="text-blue-300">{t('updating-event')}</div>
          ) : (
            <div className="text-zinc-400/80">{t('pending-event-update')}</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title={t('common:complete')}
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.updated === 'success' ? (
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

        {event.id && hasSuccess && (
          <Button
            onClick={() => closeAllModals()}
            className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
          >
            {t('event-details')}
          </Button>
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
              router.push(`/${wsId}/calendar/events`);
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
            ? t('common:return')
            : hasSuccess
            ? t('common:complete')
            : started
            ? t('common:creating')
            : t('common:start')}
        </button>
      </div>
    </>
  );
};

export default CalendarEventEditModal;
