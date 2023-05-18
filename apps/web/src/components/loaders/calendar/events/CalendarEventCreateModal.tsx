import { Button, Timeline } from '@mantine/core';
import { useState } from 'react';
import { CheckBadgeIcon, PlusIcon } from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Status } from '../../status';
import { CalendarEvent } from '../../../../types/primitives/CalendarEvent';
import { useCalendar } from '../../../../hooks/useCalendar';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  wsId: string;
  event: Partial<CalendarEvent>;
}

interface Progress {
  created: Status;
}

const CalendarEventCreateModal = ({ wsId, event }: Props) => {
  const router = useRouter();

  const { t } = useTranslation('calendar-event-create-form');
  const { refresh } = useCalendar();

  const [progress, setProgress] = useState<Progress>({
    created: 'idle',
  });

  const hasError = progress.created === 'error';
  const hasSuccess = progress.created === 'success';

  const createCalendarEvent = async (event: Partial<CalendarEvent>) => {
    const res = await fetch(`/api/workspaces/${wsId}/calendar/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (res.ok) {
      await refresh();

      setProgress((progress) => ({ ...progress, created: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo sự kiện',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, created: 'error' }));
      return false;
    }
  };

  const [eventId, setCalendarEventId] = useState<string | null>(null);

  const handleCreate = async () => {
    setProgress((progress) => ({ ...progress, created: 'loading' }));
    const eventId = await createCalendarEvent(event);
    if (eventId) setCalendarEventId(eventId);
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
          title={t('create-event')}
        >
          {progress.created === 'success' ? (
            <div className="text-green-300">{t('created-event')}</div>
          ) : progress.created === 'error' ? (
            <div className="text-red-300">{t('cant-create-event')}</div>
          ) : progress.created === 'loading' ? (
            <div className="text-blue-300">{t('creating-event')}</div>
          ) : (
            <div className="text-zinc-400/80">{t('pending-event-create')}</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title={t('common:complete')}
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.created === 'success' ? (
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

        {eventId && (hasError || hasSuccess) && (
          <Link
            href={`/${wsId}/calendar/events/${eventId}`}
            onClick={() => closeAllModals()}
            className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
          >
            {t('event-details')}
          </Link>
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
              handleCreate();
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

export default CalendarEventCreateModal;
