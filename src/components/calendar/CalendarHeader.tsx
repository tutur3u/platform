import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { SegmentedControl } from '@mantine/core';
import { useCalendar } from '../../hooks/useCalendar';

export default function CalendarHeader() {
  const {
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
        <span className="h-fit rounded bg-green-300/20 px-4 py-1 text-lg text-green-300">
          Coming soon
        </span>
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
          className="h-full rounded-lg bg-blue-300/10 p-2 text-3xl transition hover:bg-blue-300/20"
          onClick={handlePrev}
        >
          <ChevronLeftIcon className="w-4" />
        </button>
        <button
          onClick={selectToday}
          className="cursor-pointer rounded-lg bg-blue-300/10 p-2 text-lg font-semibold transition hover:bg-blue-300/20"
        >
          Today
        </button>
        <button
          className="h-full rounded-lg bg-blue-300/10 p-2 text-3xl transition hover:bg-blue-300/20"
          onClick={handleNext}
        >
          <ChevronRightIcon className="w-4" />
        </button>
      </div>
    </div>
  );
}
