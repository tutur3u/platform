import { Divider, Popover, TextInput } from '@mantine/core';
import { DatePicker, TimeInput } from '@mantine/dates';
import { useState } from 'react';
import { useCalendar } from '../../hooks/useCalendar';

interface CalendarCellProps {
  date: string;
  hour: number;
}

const CalendarCell = ({ date, hour }: CalendarCellProps) => {
  const id = `cell-${date}-${hour}`;

  const {
    getModalStatus,
    isModalActive,
    openModal,
    closeModal,
    addEmptyEvent,
    updateEvent,
    deleteEvent,
    getDatesInView,
  } = useCalendar();

  const isOpened = getModalStatus(id);
  const dates = getDatesInView();
  const columns = dates.length;

  const [recentEventId, setRecentEventId] = useState<string | null>(null);

  const handleCreateEvent = () => {
    if (isOpened || isModalActive()) return;
    const newDate = new Date(date);

    newDate.setDate(newDate.getDate() + 1);
    newDate.setHours(hour, 0, 0, 0);

    const newEvent = addEmptyEvent(newDate);
    setRecentEventId(newEvent.id);
    setEventStartDate(newEvent.start_at);
    setEventEndDate(newEvent.end_at);

    openModal(id);
  };

  const [eventTitle, setEventTitle] = useState<string>('');
  const [eventStartDate, setEventStartDate] = useState<Date | null>(null);
  const [eventEndDate, setEventEndDate] = useState<Date | null>(null);

  const hasData = eventTitle;

  const handlePopoverClose = () => {
    if (recentEventId)
      if (hasData && eventStartDate && eventEndDate) {
        updateEvent(recentEventId, {
          title: eventTitle,
          start_at: eventStartDate,
          end_at: eventEndDate,
        });
      } else deleteEvent(recentEventId);

    setEventTitle('');
    setEventStartDate(null);
    setEventEndDate(null);
    setRecentEventId(null);
  };

  return (
    <div
      id={id}
      className="calendar-cell grid h-20 border-l border-b border-zinc-800"
    >
      <Popover
        opened={isOpened}
        onChange={(opened) => (opened ? openModal(id) : closeModal())}
        position={columns === 1 ? 'top' : 'right'}
        onClose={handlePopoverClose}
        closeOnEscape
        trapFocus
        withArrow
      >
        <Popover.Target>
          <button onClick={handleCreateEvent} className="cursor-default" />
        </Popover.Target>
        <Popover.Dropdown>
          <div className="text-left">
            <TextInput
              label="Event title"
              placeholder="Name"
              size="xs"
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
            />

            <Divider mt="sm" mb="xs" />

            <DatePicker
              label="Start date"
              value={eventStartDate}
              onChange={setEventStartDate}
            />
            <TimeInput
              label="Start time"
              value={eventStartDate}
              onChange={setEventStartDate}
            />

            <Divider mt="sm" mb="xs" />

            <DatePicker
              label="End date"
              value={eventEndDate}
              onChange={setEventEndDate}
            />
            <TimeInput
              label="End time"
              value={eventEndDate}
              onChange={setEventEndDate}
            />
          </div>
        </Popover.Dropdown>
      </Popover>
    </div>
  );
};

export default CalendarCell;
