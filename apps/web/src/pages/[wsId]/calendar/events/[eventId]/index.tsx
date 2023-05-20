import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import { Divider, TextInput, Textarea } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import useTranslation from 'next-translate/useTranslation';
import { DateTimePicker } from '@mantine/dates';
import ColorPallete from '../../../../../components/color/ColorPallete';
import { SupportedColor } from '../../../../../types/primitives/SupportedColors';
import { useRouter } from 'next/router';
import { CalendarEvent } from '../../../../../types/primitives/CalendarEvent';
import useSWR from 'swr';
import CalendarEventEditModal from '../../../../../components/loaders/calendar/events/CalendarEventEditModal';
import CalendarEventDeleteModal from '../../../../../components/loaders/calendar/events/CalendarEventDeleteModal';
import moment from 'moment';
import 'dayjs/locale/vi';

export const getServerSideProps = enforceHasWorkspaces;

const EventDetailsPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const { t, lang } = useTranslation('calendar-event-configs');

  const untitledLabel = t('common:untitled');
  const calendarLabel = t('calendar-tabs:calendar');
  const eventsLabel = t('calendar-tabs:events');

  const router = useRouter();
  const { wsId, eventId } = router.query;

  const apiPath =
    wsId && eventId
      ? `/api/workspaces/${wsId}/calendar/events/${eventId}`
      : null;

  const { data: event } = useSWR<CalendarEvent>(apiPath);

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || untitledLabel,
              href: `/${ws.id}`,
            },
            { content: calendarLabel, href: `/${ws.id}/calendar` },
            { content: eventsLabel, href: `/${ws.id}/calendar/events` },
            {
              content: event?.title || untitledLabel,
              href: `/${wsId}/calendar/events/${eventId}`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [
    wsId,
    eventId,
    calendarLabel,
    eventsLabel,
    untitledLabel,
    ws,
    event,
    setRootSegment,
  ]);

  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [startDate, setStartDate] = useState<Date | null>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [color, setColor] = useState<SupportedColor>('blue');

  useEffect(() => {
    if (!event) return;

    setTitle(event?.title || '');
    setDescription(event?.description || '');
    setStartDate(new Date(event?.start_at));
    setEndDate(new Date(event?.end_at));
    setColor((event?.color?.toLowerCase() || 'blue') as SupportedColor);
  }, [event]);

  const hasRequiredFields = () => startDate && endDate;

  const showEditModal = () => {
    if (!event) return;
    if (typeof eventId !== 'string') return;
    if (!startDate || !endDate) return;
    if (!ws?.id) return;

    openModal({
      title: (
        <div className="font-semibold">
          {t('calendar-event-edit-form:update-event')}
        </div>
      ),
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <CalendarEventEditModal
          wsId={ws.id}
          oldEvent={event}
          event={{
            id: eventId,
            title,
            description,
            start_at: startDate?.toISOString(),
            end_at: endDate?.toISOString(),
            ws_id: ws.id,
            color,
          }}
        />
      ),
    });
  };

  const showDeleteModal = () => {
    if (!event) return;
    if (typeof eventId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: (
        <div className="font-semibold">
          {t('calendar-event-delete-form:delete-event')}
        </div>
      ),
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: <CalendarEventDeleteModal wsId={ws.id} eventId={eventId} />,
    });
  };

  const reset = () => {
    setTitle(event?.title || '');
    setDescription(event?.description || '');
    setStartDate(event?.start_at ? moment(event?.start_at).toDate() : null);
    setEndDate(event?.end_at ? moment(event?.end_at).toDate() : null);
    setColor((event?.color?.toLowerCase() || 'blue') as SupportedColor);
  };

  const isDirty = () => {
    if (title !== event?.title) return true;
    if (description !== event?.description) return true;
    if (color !== event?.color?.toLowerCase()) return true;

    if (
      startDate?.toISOString() !==
      (event?.start_at ? moment(event?.start_at).toISOString() : null)
    )
      return true;
    if (
      endDate?.toISOString() !==
      (event?.end_at ? moment(event?.end_at).toISOString() : null)
    )
      return true;

    return false;
  };

  const getInputColor = () => {
    switch (color) {
      case 'red':
        return 'focus:border-red-500/10 border-red-500/10 bg-red-500/10 text-red-600 placeholder-red-600/50 dark:focus:border-red-300/10 dark:border-red-300/10 dark:bg-red-300/5 dark:text-red-200 dark:placeholder-red-200/30';

      case 'blue':
        return 'focus:border-blue-500/10 border-blue-500/10 bg-blue-500/10 text-blue-600 placeholder-blue-600/50 dark:focus:border-blue-300/10 dark:border-blue-300/10 dark:bg-blue-300/5 dark:text-blue-200 dark:placeholder-blue-200/30';

      case 'green':
        return 'focus:border-green-500/10 border-green-500/10 bg-green-500/10 text-green-600 placeholder-green-600/50 dark:focus:border-green-300/10 dark:border-green-300/10 dark:bg-green-300/5 dark:text-green-200 dark:placeholder-green-200/30';

      case 'yellow':
        return 'focus:border-yellow-500/10 border-yellow-500/10 bg-yellow-500/10 text-yellow-600 placeholder-yellow-600/50 dark:focus:border-yellow-300/10 dark:border-yellow-300/10 dark:bg-yellow-300/5 dark:text-yellow-200 dark:placeholder-yellow-200/30';

      case 'orange':
        return 'focus:border-orange-500/10 border-orange-500/10 bg-orange-500/10 text-orange-600 placeholder-orange-600/50 dark:focus:border-orange-300/10 dark:border-orange-300/10 dark:bg-orange-300/5 dark:text-orange-200 dark:placeholder-orange-200/30';

      case 'pink':
        return 'focus:border-pink-500/10 border-pink-500/10 bg-pink-500/10 text-pink-600 placeholder-pink-600/50 dark:focus:border-pink-300/10 dark:border-pink-300/10 dark:bg-pink-300/5 dark:text-pink-200 dark:placeholder-pink-200/30';

      case 'purple':
        return 'focus:border-purple-500/10 border-purple-500/10 bg-purple-500/10 text-purple-600 placeholder-purple-600/50 dark:focus:border-purple-300/10 dark:border-purple-300/10 dark:bg-purple-300/5 dark:text-purple-200 dark:placeholder-purple-200/30';

      case 'indigo':
        return 'focus:border-indigo-500/10 border-indigo-500/10 bg-indigo-500/10 text-indigo-600 placeholder-indigo-600/50 dark:focus:border-indigo-300/10 dark:border-indigo-300/10 dark:bg-indigo-300/5 dark:text-indigo-200 dark:placeholder-indigo-200/30';

      case 'cyan':
        return 'focus:border-cyan-500/10 border-cyan-500/10 bg-cyan-500/10 text-cyan-600 placeholder-cyan-600/50 dark:focus:border-cyan-300/10 dark:border-cyan-300/10 dark:bg-cyan-300/5 dark:text-cyan-200 dark:placeholder-cyan-200/30';

      case 'gray':
        return 'focus:border-gray-500/10 border-gray-500/10 bg-gray-500/10 text-gray-600 placeholder-gray-600/50 dark:focus:border-gray-300/10 dark:border-gray-300/10 dark:bg-gray-300/5 dark:text-gray-200 dark:placeholder-gray-200/30';
    }
  };

  const getLabelColor = () => {
    switch (color) {
      case 'red':
        return 'text-red-800 dark:text-red-100';

      case 'blue':
        return 'text-blue-800 dark:text-blue-100';

      case 'green':
        return 'text-green-800 dark:text-green-100';

      case 'yellow':
        return 'text-yellow-800 dark:text-yellow-100';

      case 'orange':
        return 'text-orange-800 dark:text-orange-100';

      case 'pink':
        return 'text-pink-800 dark:text-pink-100';

      case 'purple':
        return 'text-purple-800 dark:text-purple-100';

      case 'indigo':
        return 'text-indigo-800 dark:text-indigo-100';

      case 'cyan':
        return 'text-cyan-800 dark:text-cyan-100';

      case 'gray':
        return 'text-gray-800 dark:text-gray-100';
    }
  };

  return (
    <>
      <HeaderX label={`${eventsLabel} – ${calendarLabel}`} />
      <div className="flex min-h-full w-full flex-col">
        {event && hasRequiredFields() && (
          <div
            className={`fixed inset-x-0 bottom-0 z-[100] mx-4 mb-[4.5rem] flex flex-col items-center justify-between gap-y-4 rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 backdrop-blur transition duration-300 dark:border-zinc-300/10 dark:bg-zinc-900/80 md:mx-8 md:mb-4 md:flex-row lg:mx-16 xl:mx-32 ${
              isDirty() ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <div>{t('common:unsaved-changes')}</div>

            <div className="flex w-full items-center gap-4 md:w-fit">
              <button
                className={`w-full font-semibold text-zinc-700 transition dark:text-zinc-300 md:w-fit ${
                  isDirty()
                    ? ''
                    : 'pointer-events-none cursor-not-allowed opacity-50'
                }`}
                onClick={reset}
              >
                {t('common:reset')}
              </button>

              <button
                className={`w-full rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 md:w-fit ${
                  isDirty()
                    ? 'hover:bg-blue-300/20'
                    : 'pointer-events-none cursor-not-allowed opacity-50'
                }`}
                onClick={showEditModal}
              >
                {t('common:save')}
              </button>
            </div>
          </div>
        )}

        <div className="grid h-fit max-w-lg gap-2 pb-32">
          <TextInput
            label={t('event-name')}
            placeholder={t('event-name')}
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            classNames={{
              input: `font-semibold ${getInputColor()}`,
              label: getLabelColor(),
            }}
          />

          <Textarea
            label={t('event-description')}
            placeholder={t('event-description')}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            classNames={{
              input: `font-semibold ${getInputColor()}`,
              label: getLabelColor(),
            }}
          />

          <Divider className="mt-2" variant="dashed" />
          <div className="grid gap-2 md:grid-cols-2">
            <DateTimePicker
              label={t('start-at')}
              placeholder={t('start-at')}
              value={startDate}
              onChange={(date) => {
                // Make sure start date and end date are on the same day
                // If not, set end date's date to start date's date (keep time)
                if (date && endDate && date?.getDate() !== endDate?.getDate()) {
                  const newEndDate = new Date(endDate);
                  newEndDate.setDate(date.getDate());
                  setEndDate(newEndDate);
                }

                setStartDate(date);
              }}
              classNames={{
                input: `font-semibold ${getInputColor()}`,
                label: getLabelColor(),
              }}
              clearable={false}
              valueFormat="DD/MM/YYYY, HH:mm"
              locale={lang}
              required
            />

            <DateTimePicker
              label={t('end-at')}
              placeholder={t('end-at')}
              value={endDate}
              onChange={(date) => {
                // Make sure start date and end date are on the same day
                // If not, set end date's date to start date's date (keep time)
                if (
                  date &&
                  startDate &&
                  date?.getDate() !== startDate?.getDate()
                ) {
                  const newStartDate = new Date(startDate);
                  newStartDate.setDate(date.getDate());
                  setStartDate(newStartDate);
                }

                setEndDate(date);
              }}
              classNames={{
                input: `font-semibold ${getInputColor()}`,
                label: getLabelColor(),
              }}
              clearable={false}
              valueFormat="DD/MM/YYYY, HH:mm"
              locale={lang}
              required
            />
          </div>
          <Divider className="mt-2" />
          <ColorPallete
            value={color}
            onChange={(color) => setColor(color)}
            variant="card"
            disabled={!ws || !event}
          />
          <Divider className="my-1" />
          <div
            onClick={showDeleteModal}
            className="flex cursor-pointer items-center justify-center rounded border border-red-300/20 bg-red-300/10 p-2 font-semibold text-red-300 transition duration-300 hover:border-red-300/30 hover:bg-red-300/20"
          >
            {t('common:delete')}
          </div>
        </div>
      </div>
    </>
  );
};

EventDetailsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout>{page}</NestedLayout>;
};

export default EventDetailsPage;
