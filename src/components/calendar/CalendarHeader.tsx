import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { SegmentedControl } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useCalendar } from '../../hooks/useCalendar';

export default function CalendarHeader() {
  const {
    isToday,
    getTitle,
    getView,
    handlePrev,
    handleNext,
    selectToday,
    enableDayView,
    enable4DayView,
    enableWeekView,
  } = useCalendar();

  const [availableOptions, setAvailableOptions] = useState<
    { value: string; label: string }[]
  >([]);

  useEffect(() => {
    if (window.innerWidth > 768) {
      setAvailableOptions([
        {
          value: 'day',
          label: 'Day',
        },
        {
          value: '4-day',
          label: '4 Days',
        },
        {
          value: 'week',
          label: 'Week',
        },
      ]);
    } else {
      setAvailableOptions([
        {
          value: 'day',
          label: 'Day',
        },
      ]);
    }
  }, []);

  return (
    <div className="mb-8 flex flex-col justify-between gap-2 md:flex-row">
      <div className="flex items-center gap-4 text-3xl font-semibold">
        <span>{getTitle()}</span>
      </div>

      <div className="flex items-center justify-center gap-2 text-blue-300">
        <div>
          <SegmentedControl
            radius="md"
            className="mr-2"
            defaultValue={getView()}
            data={availableOptions}
            onChange={(value) => {
              if (value === 'day') enableDayView();
              if (value === '4-day') enable4DayView();
              if (value === 'week') enableWeekView();
            }}
          />
        </div>

        <button
          className="h-fit rounded-lg bg-blue-300/10 p-2 text-3xl transition hover:bg-blue-300/20"
          onClick={handlePrev}
        >
          <ChevronLeftIcon className="w-4" />
        </button>
        <button
          onClick={selectToday}
          className={`rounded-lg p-2 text-lg font-semibold transition ${
            isToday()
              ? 'cursor-default bg-zinc-300/10 text-zinc-300 opacity-50'
              : 'cursor-pointer bg-blue-300/10 hover:bg-blue-300/20'
          }`}
        >
          Today
        </button>
        <button
          className="h-fit rounded-lg bg-blue-300/10 p-2 text-3xl transition hover:bg-blue-300/20"
          onClick={handleNext}
        >
          <ChevronRightIcon className="w-4" />
        </button>
      </div>
    </div>
  );
}
