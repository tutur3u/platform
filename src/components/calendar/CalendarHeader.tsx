import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { SegmentedControl } from '@mantine/core';

interface CalendarHeaderProps {
  title: string;
  prevHandler: () => void;
  nextHandler: () => void;
  todayHandler: () => void;
  dayModeHandler?: () => void;
  weekModeHandler?: () => void;
}

export default function CalendarHeader({
  title,
  prevHandler,
  nextHandler,
  todayHandler,

  dayModeHandler,
  weekModeHandler,
}: CalendarHeaderProps) {
  return (
    <div className="mb-8 flex justify-between">
      <div className="text-3xl font-semibold">
        <span>{title}</span>
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
              value: 'week',
              label: 'Week',
            },
          ]}
          onChange={(value) => {
            if (value === 'day' && dayModeHandler) dayModeHandler();
            if (value === 'week' && weekModeHandler) weekModeHandler();
          }}
        />

        <button
          className="h-full rounded-lg bg-blue-300/10 p-2 text-3xl transition hover:bg-blue-300/20"
          onClick={prevHandler}
        >
          <ChevronLeftIcon className="w-4" />
        </button>
        <button
          onClick={todayHandler}
          className="cursor-pointer rounded-lg bg-blue-300/10 p-2 text-lg font-semibold transition hover:bg-blue-300/20"
        >
          Today
        </button>
        <button
          className="h-full rounded-lg bg-blue-300/10 p-2 text-3xl transition hover:bg-blue-300/20"
          onClick={nextHandler}
        >
          <ChevronRightIcon className="w-4" />
        </button>
      </div>
    </div>
  );
}
