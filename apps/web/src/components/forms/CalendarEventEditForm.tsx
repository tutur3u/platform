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

  const [startDate, setStartDate] = useState<Date | null | undefined>(
    event?.start_at || undefined
  );

  const [endDate, setEndDate] = useState<Date | null | undefined>(
    event?.end_at || undefined
  );

  useEffect(() => {
    updateEvent(id, {
      start_at: startDate || undefined,
      end_at: endDate || undefined,
    });
  }, [id, startDate, endDate, updateEvent]);

  const getInputColor = () => {
    switch (event?.color || 'blue') {
      case 'red':
        return 'focus:border-red-300/10 border-red-300/10 bg-red-300/5 text-red-200';
      case 'blue':
        return 'focus:border-blue-300/10 border-blue-300/10 bg-blue-300/5 text-blue-200';
      case 'green':
        return 'focus:border-green-300/10 border-green-300/10 bg-green-300/5 text-green-200';
      case 'yellow':
        return 'focus:border-yellow-300/10 border-yellow-300/10 bg-yellow-300/5 text-yellow-200';
      case 'orange':
        return 'focus:border-orange-300/10 border-orange-300/10 bg-orange-300/5 text-orange-200';
      case 'pink':
        return 'focus:border-pink-300/10 border-pink-300/10 bg-pink-300/5 text-pink-200';
      case 'purple':
        return 'focus:border-purple-300/10 border-purple-300/10 bg-purple-300/5 text-purple-200';
      case 'indigo':
        return 'focus:border-indigo-300/10 border-indigo-300/10 bg-indigo-300/5 text-indigo-200';
      case 'cyan':
        return 'focus:border-cyan-300/10 border-cyan-300/10 bg-cyan-300/5 text-cyan-200';
      case 'gray':
        return 'focus:border-gray-300/10 border-gray-300/10 bg-gray-300/5 text-gray-200';
    }
  };

  const getLabelColor = () => {
    switch (event?.color || 'blue') {
      case 'red':
        return 'text-red-100';
      case 'blue':
        return 'text-blue-100';
      case 'green':
        return 'text-green-100';
      case 'yellow':
        return 'text-yellow-100';
      case 'orange':
        return 'text-orange-100';
      case 'pink':
        return 'text-pink-100';
      case 'purple':
        return 'text-purple-100';
      case 'indigo':
        return 'text-indigo-100';
      case 'cyan':
        return 'text-cyan-100';
      case 'gray':
        return 'text-gray-100';
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
            setStartDate((prev) => {
              if (!date) return null;
              if (!prev) return date;
              return new Date(
                prev.setHours(date.getHours(), date.getMinutes())
              );
            });
          }}
          clearable={false}
          variant="filled"
          classNames={{
            input: `font-semibold ${getInputColor()}`,
            label: getLabelColor(),
          }}
          popoverProps={{ withinPortal: true }}
        />

        <DateTimePicker
          label="End at"
          value={endDate}
          onChange={(date) => {
            setEndDate((prev) => {
              if (!date) return null;
              if (!prev) return date;
              return new Date(
                prev.setHours(date.getHours(), date.getMinutes())
              );
            });
          }}
          clearable={false}
          variant="filled"
          classNames={{
            input: `font-semibold ${getInputColor()}`,
            label: getLabelColor(),
          }}
          popoverProps={{ withinPortal: true }}
        />
      </div>

      <Divider mt="sm" mb="xs" className={getInputColor()} />
      <ColorPallete
        value={event?.color || 'blue'}
        onChange={(color) => updateEvent(id, { color })}
      />
      <Divider mt="sm" mb="xs" className={getInputColor()} />

      <Button
        className="w-full border border-red-300/10 bg-[#582c30]/50 transition"
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
