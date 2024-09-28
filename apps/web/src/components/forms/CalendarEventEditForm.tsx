import ColorPallete from '../../../../web/src/components/color/ColorPallete';
import { useCalendar } from '@/hooks/useCalendar';
import { SupportedColor } from '@/types/primitives/SupportedColors';
import { Button, Divider, TextInput, Textarea } from '@mantine/core';
import 'dayjs/locale/vi';
import { Trash } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

interface CalendarEventEditFormProps {
  id: string;
}

const CalendarEventEditForm = ({ id }: CalendarEventEditFormProps) => {
  const router = useRouter();

  const { wsId } = router.query;

  const { getEvent, updateEvent, deleteEvent } = useCalendar();
  const event = getEvent(id);

  const [startDate] = useState<Date | null>(
    event?.start_at ? moment(event.start_at).toDate() : null
  );

  const [endDate, setEndDate] = useState<Date | null>(
    event?.end_at ? moment(event.end_at).toDate() : null
  );

  useEffect(() => {
    if (!startDate || !endDate) return;

    // Make sure end date is always after start date
    if (startDate > endDate) {
      // Make sure it's 1 hour after start date and before 23:59
      const newEndDate = new Date(startDate);
      newEndDate.setMinutes(newEndDate.getMinutes() + 60);

      if (newEndDate.getHours() >= 23) {
        newEndDate.setHours(23);
        newEndDate.setMinutes(59);
      }

      setEndDate(newEndDate);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    updateEvent(id, {
      start_at: startDate?.toISOString() || undefined,
      end_at: endDate?.toISOString() || undefined,
    });
  }, [id, startDate, endDate, updateEvent]);

  const eventColor = event?.color?.toLowerCase() || 'blue';

  const getInputColor = () => {
    switch (eventColor) {
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
    switch (eventColor) {
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

  // const generateColor = () => {
  //   const colors: {
  //     [key: string]: string;
  //   } = {
  //     red: 'bg-[#fcdada] dark:bg-[#302729] border-red-500/80 text-red-600 dark:border-red-300/80 dark:text-red-200',
  //     blue: 'bg-[#d8e6fd] dark:bg-[#252a32] border-blue-500/80 text-blue-600 dark:border-blue-300/80 dark:text-blue-200',
  //     green:
  //       'bg-[#d3f3df] dark:bg-[#242e2a] border-green-500/80 text-green-600 dark:border-green-300/80 dark:text-green-200',
  //     yellow:
  //       'bg-[#fbf0ce] dark:bg-[#302d1f] border-yellow-500/80 text-yellow-600 dark:border-yellow-300/80 dark:text-yellow-200',
  //     orange:
  //       'bg-[#fee3d0] dark:bg-[#302924] border-orange-500/80 text-orange-600 dark:border-orange-300/80 dark:text-orange-200',
  //     purple:
  //       'bg-[#eeddfd] dark:bg-[#2c2832] border-purple-500/80 text-purple-600 dark:border-purple-300/80 dark:text-purple-200',
  //     pink: 'bg-[#fbdaeb] dark:bg-[#2f272e] border-pink-500/80 text-pink-600 dark:border-pink-300/80 dark:text-pink-200',
  //     indigo:
  //       'bg-[#e0e0fc] dark:bg-[#272832] border-indigo-500/80 text-indigo-600 dark:border-indigo-300/80 dark:text-indigo-200',
  //     cyan: 'bg-[#cdf0f6] dark:bg-[#212e31] border-cyan-500/80 text-cyan-600 dark:border-cyan-300/80 dark:text-cyan-200',
  //     gray: 'bg-[#e1e3e6] dark:bg-[#2b2c2e] border-gray-500/80 text-gray-600 dark:border-gray-300/80 dark:text-gray-200',
  //   };

  //   return colors[eventColor];
  // };

  const t = (key: string) => key;

  const countApiPath =
    wsId && event
      ? `/api/workspaces/${wsId}/calendar/events/${event.id}/participants/count`
      : null;

  const { data: count } = useSWR<{
    platform: number;
    virtual: number;
    groups: number;
    pending: number;
    going: number;
    not_going: number;
  }>(countApiPath);

  if (!event) return null;

  return (
    <div className="pointer-events-auto text-left">
      <div className="grid gap-2">
        <TextInput
          label={t('event-name')}
          placeholder={t('event-name')}
          value={event.title}
          onChange={(e) =>
            updateEvent(id, {
              title: e.target.value,
            })
          }
          autoComplete="off"
          variant="filled"
          classNames={{
            input: `font-semibold ${getInputColor()}`,
            label: getLabelColor(),
          }}
        />

        <Textarea
          label={t('event-description')}
          placeholder={t('event-description')}
          value={event.description}
          onChange={(e) =>
            updateEvent(id, {
              description: e.target.value,
            })
          }
          autoComplete="off"
          variant="filled"
          classNames={{
            input: `font-semibold ${getInputColor()}`,
            label: getLabelColor(),
          }}
        />
      </div>

      <Divider mt="sm" mb="xs" className={getInputColor()} />

      {/* <div className="mt-2 grid grid-cols-2 gap-2">
        <DateTimePicker
          label={t('start-at')}
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
          clearable={false}
          locale={locale}
          variant="filled"
          valueFormat="DD/MM/YYYY, HH:mm"
          placeholder={'Date & time'}
          classNames={{
            input: `font-semibold ${getInputColor()}`,
            label: getLabelColor(),
          }}
          popoverProps={{
            classNames: {
              dropdown: generateColor(),
            },
          }}
        />

        <DateTimePicker
          label={t('end-at')}
          value={endDate}
          onChange={(date) => {
            // Make sure start date and end date are on the same day
            // If not, set end date's date to start date's date (keep time)
            if (date && startDate && date?.getDate() !== startDate?.getDate()) {
              const newStartDate = new Date(startDate);
              newStartDate.setDate(date.getDate());
              setStartDate(newStartDate);
            }

            setEndDate(date);
          }}
          clearable={false}
          locale={locale}
          variant="filled"
          valueFormat="DD/MM/YYYY, HH:mm"
          placeholder={'Date & time'}
          classNames={{
            input: `font-semibold ${getInputColor()}`,
            label: getLabelColor(),
          }}
          popoverProps={{
            classNames: {
              dropdown: generateColor(),
            },
          }}
        />
      </div> */}

      <Divider mt="sm" mb="xs" className={getInputColor()} />
      <ColorPallete
        value={eventColor as SupportedColor}
        onChange={(color) => updateEvent(id, { color })}
      />

      <Divider mt="sm" mb="xs" className={getInputColor()} />
      <div className="grid gap-2 text-center md:grid-cols-3">
        <div className="rounded border p-2 dark:border-purple-300/10 dark:bg-purple-300/10 dark:text-purple-300">
          <div className="font-semibold">Chưa quyết định</div>
          <Divider className="my-1 dark:border-purple-300/10" />
          <div className="text-3xl font-bold">
            {count?.pending != null ? count?.pending : '-'}
          </div>
        </div>
        <div className="rounded border p-2 dark:border-green-300/10 dark:bg-green-300/10 dark:text-green-300">
          <div className="font-semibold">Sẽ tham gia</div>
          <Divider className="my-1 dark:border-green-300/10" />
          <div className="text-3xl font-bold">
            {count?.going != null ? count?.going : '-'}
          </div>
        </div>
        <div className="rounded border p-2 dark:border-red-300/10 dark:bg-red-300/10 dark:text-red-300">
          <div className="font-semibold">Không tham gia</div>
          <Divider className="my-1 dark:border-red-300/10" />
          <div className="text-3xl font-bold">
            {count?.not_going != null ? count?.not_going : '-'}
          </div>
        </div>
      </div>
      <Divider mt="sm" mb="xs" className={getInputColor()} />

      <div className="flex gap-2">
        <Button className={`w-full border ${getInputColor()}`} variant="light">
          {t('view-event')}
        </Button>

        <Button
          className="flex items-center justify-center border border-red-500/10 bg-[#e2d3d6] text-center text-red-600 transition hover:bg-red-500/20 dark:border-red-300/10 dark:bg-[#582c30]/50 dark:text-red-300 dark:hover:bg-[#582c30]/80"
          variant="light"
          color="red"
          onClick={() => deleteEvent(event?.id || '')}
        >
          <Trash className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default CalendarEventEditForm;
