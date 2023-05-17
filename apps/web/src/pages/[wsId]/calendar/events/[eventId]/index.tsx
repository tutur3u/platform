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

export const getServerSideProps = enforceHasWorkspaces;

const EventDetailsPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const { t } = useTranslation('calendar-tabs');

  const untitledLabel = t('common:untitled');
  const calendarLabel = t('calendar');
  const eventsLabel = t('events');

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
              content: ws?.name || 'Tổ chức không tên',
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

    setTitle(event?.title);
    setDescription(event?.description);
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
      title: <div className="font-semibold">{t('update-user-event')}</div>,
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
      title: <div className="font-semibold">{t('delete-user-event')}</div>,
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

  return (
    <>
      <HeaderX label="Sản phẩm – Kho hàng" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-20">
        {hasRequiredFields() && isDirty() && (
          <div
            className={`bg-bg-zinc-900/80 absolute inset-x-0 bottom-0 z-[100] mx-4 mb-[4.5rem] flex flex-col items-center justify-between gap-y-4 rounded-lg border border-zinc-300/10 p-4 backdrop-blur transition duration-300 md:mx-8 md:mb-4 md:flex-row lg:mx-16 xl:mx-32 ${
              isDirty() ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <div>{t('common:unsaved-changes')}</div>

            <div className="flex w-full items-center gap-2 md:w-fit">
              <button
                className={`w-full rounded border border-zinc-300/10 bg-zinc-300/5 px-4 py-1 font-semibold text-zinc-300 transition md:w-fit ${
                  isDirty()
                    ? 'hover:bg-zinc-300/10'
                    : 'pointer-events-none cursor-not-allowed opacity-50'
                }`}
                onClick={reset}
              >
                {t('common:reset')}
              </button>

              <button
                className={`w-full rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition md:w-fit ${
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

        <div className="grid h-fit max-w-lg gap-2">
          <div className="col-span-full">
            <div className="text-2xl font-semibold">Thông tin cơ bản</div>
            <Divider className="my-2" variant="dashed" />
          </div>

          <TextInput
            label="Tên sự kiện"
            placeholder="Nhập tên sự kiện"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            disabled={!ws || !event}
          />

          <Textarea
            label="Mô tả"
            placeholder="Nhập mô tả sự kiện"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            disabled={!ws || !event}
          />

          <Divider className="mt-2" variant="dashed" />
          <div className="grid gap-2 md:grid-cols-2">
            <DateTimePicker
              label="Start at"
              placeholder="Chọn ngày bắt đầu"
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
                input: 'dark:bg-[#25262b]',
              }}
              clearable={false}
              disabled={!ws || !event}
              required
            />

            <DateTimePicker
              label="End at"
              placeholder="Chọn ngày kết thúc"
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
                input: 'dark:bg-[#25262b]',
              }}
              clearable={false}
              disabled={!ws || !event}
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
