'use client';

import { useEffect, useState } from 'react';
import {
  Accordion,
  Button,
  Chip,
  Divider,
  TextInput,
  Textarea,
} from '@mantine/core';
import { openModal } from '@mantine/modals';
import { useSegments } from '../../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../../hooks/useWorkspaces';
import useTranslation from 'next-translate/useTranslation';
import { DateTimePicker } from '@mantine/dates';
import ColorPallete from '../../../../../../components/color/ColorPallete';
import { SupportedColor } from '../../../../../../types/primitives/SupportedColors';
import { useRouter } from 'next/router';
import { CalendarEvent } from '../../../../../../types/primitives/CalendarEvent';
import useSWR, { mutate } from 'swr';
import CalendarEventEditModal from '../../../../../../components/loaders/calendar/events/CalendarEventEditModal';
import CalendarEventDeleteModal from '../../../../../../components/loaders/calendar/events/CalendarEventDeleteModal';
import moment from 'moment';
import 'dayjs/locale/vi';
import EventParticipantCard from '../../../../../../components/cards/EventParticipantCard';
import { EventParticipant } from '../../../../../../types/primitives/EventParticipant';
import WorkspaceUserSelector from '../../../../../../components/selectors/WorkspaceUserSelector';
import { UserPlusIcon } from '@heroicons/react/24/solid';
import UserTypeSelector from '../../../../../../components/selectors/UserTypeSelector';
import { showNotification } from '@mantine/notifications';
import UserGroupSelector from '../../../../../../components/selectors/UserGroupSelector';
import EventParticipantGroupCard from '../../../../../../components/cards/EventParticipantGroupCard';
import { useAppearance } from '../../../../../../hooks/useAppearance';

export default function EventDetailsPage() {
  const { setRootSegment } = useSegments();
  const { sidebar } = useAppearance();
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
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [color, setColor] = useState<SupportedColor>('blue');

  const [userType, setUserType] = useState<
    'platform_user' | 'virtual_user' | 'user_group'
  >('platform_user');

  const [newParticipantId, setNewParticipantId] = useState('');
  const [newGroupId, setNewGroupId] = useState('');

  const [participantsView, setParticipantsView] = useState<
    'all' | 'platform_user' | 'virtual_user' | 'user_group'
  >('all');

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedGroupId(null);
    setNewParticipantId('');
    setNewGroupId('');
  }, [userType, participantsView]);

  const participantApiPath = apiPath
    ? `${apiPath}/participants${
        participantsView ? `?type=${participantsView}` : null
      }`
    : null;

  const participantCountApiPath = apiPath
    ? `${apiPath}/participants/count`
    : null;

  const { data } = useSWR<{
    count: number;
    data: EventParticipant[];
  }>(participantApiPath);

  const { data: count } = useSWR<{
    platform: number;
    virtual: number;
    groups: number;
    pending: number;
    going: number;
    not_going: number;
  }>(participantCountApiPath);

  const participants = data?.data || [];

  useEffect(() => {
    if (!event) return;

    setTitle(event?.title || '');
    setDescription(event?.description || '');
    setStartDate(event?.start_at ? moment(event?.start_at).toDate() : null);
    setEndDate(event?.end_at ? moment(event?.end_at).toDate() : null);
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
            start_at: startDate.toISOString(),
            end_at: endDate.toISOString(),
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
    if (color !== (event?.color?.toLowerCase() || 'blue')) return true;

    if (
      startDate &&
      startDate.toISOString() !==
        (event?.start_at ? moment(event?.start_at).toISOString() : null)
    )
      return true;
    if (
      endDate &&
      endDate.toISOString() !==
        (event?.end_at ? moment(event?.end_at).toISOString() : null)
    )
      return true;

    return false;
  };

  const getInputColor = (forceDefault?: boolean) => {
    switch (forceDefault ? 'gray' : color) {
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

  const inviteParticipant = async () => {
    if ((!newParticipantId && !newGroupId) || !apiPath) return;

    const res = await fetch(`${apiPath}/participants?type=${userType}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        participant_id: newParticipantId || newGroupId,
      }),
    });

    if (res.ok) {
      mutate(participantCountApiPath);
      mutate(participantApiPath);
      mutate(apiPath);

      setSelectedGroupId(null);
      setNewParticipantId('');
      setNewGroupId('');
    } else {
      showNotification({
        color: 'red',
        title: t('common:error'),
        message: t('could-not-invite'),
      });
    }
  };

  return (
    <div className="relative grid min-h-full w-full gap-4 pb-32 xl:grid-cols-2">
      {event && hasRequiredFields() && (
        <div
          className={`fixed inset-x-0 ${
            sidebar === 'open'
              ? 'mx-4 md:ml-72 md:mr-8 lg:ml-80 lg:mr-16 xl:ml-96 xl:mr-32'
              : 'mx-4 md:ml-24 md:mr-8 lg:ml-32 lg:mr-16 xl:mx-48'
          } bottom-0 z-[100] mb-[4.5rem] flex flex-col items-center justify-between gap-y-4 rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 backdrop-blur transition-all duration-500 dark:border-zinc-300/10 dark:bg-zinc-900/80 md:mb-4 md:flex-row ${
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

      <div className="grid h-fit gap-2 xl:max-w-lg">
        <div className="col-span-full">
          <div className="text-2xl font-semibold">{t('basic-info')}</div>
        </div>

        <TextInput
          label={t('event-name')}
          placeholder={t('event-name')}
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          classNames={{
            input: `font-semibold ${getInputColor(true)}`,
            label: getLabelColor(),
          }}
        />

        <Textarea
          label={t('event-description')}
          placeholder={t('event-description')}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          classNames={{
            input: `font-semibold ${getInputColor(true)}`,
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
              input: `font-semibold ${getInputColor(true)}`,
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
              input: `font-semibold ${getInputColor(true)}`,
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

      <div className="grid h-fit gap-2">
        <div className="col-span-full">
          <div className="text-2xl font-semibold">{t('participants')}</div>
        </div>

        <Chip.Group
          multiple={false}
          value={participantsView}
          onChange={(view) => {
            setParticipantsView(
              view as 'all' | 'platform_user' | 'virtual_user' | 'user_group'
            );
            if (view !== 'all')
              setUserType(
                view as 'platform_user' | 'virtual_user' | 'user_group'
              );
          }}
        >
          <div className="mb-2 flex flex-wrap justify-start gap-2">
            <Chip color="cyan" variant="light" value="all">
              {t('common:all')}{' '}
              {count?.platform !== null && count?.virtual !== null
                ? `(${(count?.platform || 0) + (count?.virtual || 0)})`
                : ''}
            </Chip>
            <Chip color="teal" variant="light" value="platform_user">
              {t('platform-users')}{' '}
              {count?.platform !== null ? `(${count?.platform || 0})` : ''}
            </Chip>
            <Chip color="grape" variant="light" value="virtual_user">
              {t('virtual-users')}{' '}
              {count?.virtual !== null ? `(${count?.virtual || 0})` : ''}
            </Chip>
            <Chip color="orange" variant="light" value="user_group">
              {t('user-groups')}
            </Chip>
          </div>
        </Chip.Group>

        <div className="grid gap-2 text-center md:grid-cols-3">
          <div className="rounded border p-4 dark:border-purple-300/10 dark:bg-purple-300/10 dark:text-purple-300">
            <div className="font-semibold">Chưa quyết định</div>
            <Divider className="my-1 dark:border-purple-300/10" />
            <div className="text-4xl font-bold">
              {count?.pending !== null ? count?.pending : '-'}
            </div>
          </div>
          <div className="rounded border p-4 dark:border-green-300/10 dark:bg-green-300/10 dark:text-green-300">
            <div className="font-semibold">Sẽ tham gia</div>
            <Divider className="my-1 dark:border-green-300/10" />
            <div className="text-4xl font-bold">
              {count?.going !== null ? count?.going : '-'}
            </div>
          </div>
          <div className="rounded border p-4 dark:border-red-300/10 dark:bg-red-300/10 dark:text-red-300">
            <div className="font-semibold">Không tham gia</div>
            <Divider className="my-1 dark:border-red-300/10" />
            <div className="text-4xl font-bold">
              {count?.not_going !== null ? count?.not_going : '-'}
            </div>
          </div>
        </div>
        <Divider className="my-1" />

        <div className="mb-1 flex flex-col items-center gap-2 rounded border p-2 dark:border-gray-300/10 dark:bg-gray-300/5 md:flex-row">
          <UserTypeSelector
            type={userType}
            setType={setUserType}
            label=""
            className="w-full md:max-w-[14rem]"
            disabled={participantsView !== 'all'}
          />
          {userType !== 'user_group' ? (
            <WorkspaceUserSelector
              userId={newParticipantId}
              setUserId={setNewParticipantId}
              label=""
              mode={userType === 'virtual_user' ? 'workspace' : 'platform'}
              creatable={userType === 'virtual_user'}
              className="w-full"
              preventPreselect
              clearable
              notEmpty
            />
          ) : (
            <UserGroupSelector
              group={{ id: newGroupId }}
              setGroup={(group) => setNewGroupId(group?.id || '')}
              className="w-full"
              preventPreselect
              clearable
              hideLabel
            />
          )}
          <Button
            variant="subtle"
            className={`w-full border md:w-fit ${
              (newParticipantId || newGroupId) &&
              'border-blue-500/10 bg-blue-500/10 hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:hover:bg-blue-300/20'
            }`}
            disabled={!newParticipantId && !newGroupId}
            onClick={inviteParticipant}
          >
            <UserPlusIcon className="h-5 w-5" />
          </Button>
        </div>

        {participantsView === 'user_group' ? (
          <Accordion
            className={`grid gap-2 rounded`}
            classNames={{
              control: `px-2 md:px-4 ${getInputColor(true)}`,
              item: `rounded border ${getInputColor(true)}`,
            }}
            value={selectedGroupId}
            onChange={setSelectedGroupId}
          >
            {wsId &&
              participants.map((p) => (
                <EventParticipantGroupCard
                  key={`${p.event_id}-${p.participant_id}-${p.type}`}
                  selected={selectedGroupId === p.participant_id}
                  wsId={wsId as string}
                  participant={p}
                  className={getInputColor(true)}
                  mutatePaths={
                    participantApiPath && participantCountApiPath
                      ? [participantApiPath, participantCountApiPath]
                      : null
                  }
                />
              ))}
          </Accordion>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {wsId &&
              participants.map((p) => (
                <EventParticipantCard
                  key={`${p.event_id}-${p.participant_id}-${p.type}`}
                  wsId={wsId as string}
                  participant={p}
                  className={getInputColor(true)}
                  mutatePaths={
                    participantApiPath && participantCountApiPath
                      ? [participantApiPath, participantCountApiPath]
                      : null
                  }
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
