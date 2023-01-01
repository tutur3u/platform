import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { SegmentedControl } from '@mantine/core';
import { useCalendar } from '../../hooks/useCalendar';

export default function CalendarHeader() {
  const {
    isToday,
    getTitle,
    handlePrev,
    handleNext,
    selectToday,
    enableDayView,
    enable4DayView,
    enableWeekView,
  } = useCalendar();

  return (
    <div className="mb-8 flex justify-between">
      <div className="flex items-center gap-4 text-3xl font-semibold">
        <span>{getTitle()}</span>
      </div>

      <div className="flex items-center justify-center gap-2 text-blue-300">
        <SegmentedControl
          radius="md"
          className="mr-2"
          defaultValue="week"
          data={[
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
          ]}
          onChange={(value) => {
            if (value === 'day') enableDayView();
            if (value === '4-day') enable4DayView();
            if (value === 'week') enableWeekView();
          }}
        />

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
              ? 'cursor-not-allowed bg-zinc-300/10 text-zinc-300 opacity-50'
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
