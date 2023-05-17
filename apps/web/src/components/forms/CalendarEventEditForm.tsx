import { TrashIcon } from '@heroicons/react/24/solid';
import { Button, Divider, TextInput } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { useEffect, useState } from 'react';
import { useCalendar } from '../../hooks/useCalendar';
import ColorPallete from '../../../../web/src/components/color/ColorPallete';

interface CalendarEventEditFormProps {
  id: string;
}

const CalendarEventEditForm = ({ id }: CalendarEventEditFormProps) => {
  const { getEvent, updateEvent, deleteEvent } = useCalendar();
  const event = getEvent(id);

  const [startDate, setStartDate] = useState<Date | null>(
    event?.start_at ?? null
  );

  const [endDate, setEndDate] = useState<Date | null>(event?.end_at ?? null);

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
      start_at: startDate || undefined,
      end_at: endDate || undefined,
    });
  }, [id, startDate, endDate, updateEvent]);

  const getInputColor = () => {
    switch (event?.color || 'blue') {
      case 'red':
        return 'focus:border-red-500/10 border-red-500/10 bg-red-500/10 text-red-600 dark:focus:border-red-300/10 dark:border-red-300/10 dark:bg-red-300/5 dark:text-red-200';

      case 'blue':
        return 'focus:border-blue-500/10 border-blue-500/10 bg-blue-500/10 text-blue-600 dark:focus:border-blue-300/10 dark:border-blue-300/10 dark:bg-blue-300/5 dark:text-blue-200';

      case 'green':
        return 'focus:border-green-500/10 border-green-500/10 bg-green-500/10 text-green-600 dark:focus:border-green-300/10 dark:border-green-300/10 dark:bg-green-300/5 dark:text-green-200';

      case 'yellow':
        return 'focus:border-yellow-500/10 border-yellow-500/10 bg-yellow-500/10 text-yellow-600 dark:focus:border-yellow-300/10 dark:border-yellow-300/10 dark:bg-yellow-300/5 dark:text-yellow-200';

      case 'orange':
        return 'focus:border-orange-500/10 border-orange-500/10 bg-orange-500/10 text-orange-600 dark:focus:border-orange-300/10 dark:border-orange-300/10 dark:bg-orange-300/5 dark:text-orange-200';

      case 'pink':
        return 'focus:border-pink-500/10 border-pink-500/10 bg-pink-500/10 text-pink-600 dark:focus:border-pink-300/10 dark:border-pink-300/10 dark:bg-pink-300/5 dark:text-pink-200';

      case 'purple':
        return 'focus:border-purple-500/10 border-purple-500/10 bg-purple-500/10 text-purple-600 dark:focus:border-purple-300/10 dark:border-purple-300/10 dark:bg-purple-300/5 dark:text-purple-200';

      case 'indigo':
        return 'focus:border-indigo-500/10 border-indigo-500/10 bg-indigo-500/10 text-indigo-600 dark:focus:border-indigo-300/10 dark:border-indigo-300/10 dark:bg-indigo-300/5 dark:text-indigo-200';

      case 'cyan':
        return 'focus:border-cyan-500/10 border-cyan-500/10 bg-cyan-500/10 text-cyan-600 dark:focus:border-cyan-300/10 dark:border-cyan-300/10 dark:bg-cyan-300/5 dark:text-cyan-200';

      case 'gray':
        return 'focus:border-gray-500/10 border-gray-500/10 bg-gray-500/10 text-gray-600 dark:focus:border-gray-300/10 dark:border-gray-300/10 dark:bg-gray-300/5 dark:text-gray-200';
    }
  };

  const getLabelColor = () => {
    switch (event?.color || 'blue') {
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
    <div className="pointer-events-auto text-left">
      <TextInput
        label="Event name"
        placeholder="Name"
        value={event?.title}
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

      <Divider mt="sm" mb="xs" className={getInputColor()} />

      <div className="mt-2 grid grid-cols-2 gap-2">
        <DateTimePicker
          label="Start at"
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
          variant="filled"
          classNames={{
            input: `font-semibold ${getInputColor()}`,
            label: getLabelColor(),
          }}
        />

        <DateTimePicker
          label="End at"
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
          variant="filled"
          classNames={{
            input: `font-semibold ${getInputColor()}`,
            label: getLabelColor(),
          }}
        />
      </div>

      <Divider mt="sm" mb="xs" className={getInputColor()} />
      <ColorPallete
        value={event?.color || 'blue'}
        onChange={(color) => updateEvent(id, { color })}
      />
      <Divider mt="sm" mb="xs" className={getInputColor()} />

      <Button
        className="w-full border border-red-500/10 bg-[#e2d3d6] text-red-600 transition hover:bg-red-500/20 dark:border-red-300/10 dark:bg-[#582c30]/50 dark:text-red-300 dark:hover:bg-[#582c30]/80"
        variant="light"
        color="red"
        leftIcon={<TrashIcon className="h-5 w-5" />}
        onClick={() => deleteEvent(event?.id || '')}
      >
        Delete event
      </Button>
    </div>
  );
};

export default CalendarEventEditForm;
