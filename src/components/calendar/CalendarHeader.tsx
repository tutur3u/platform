import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { Center, SegmentedControl } from '@mantine/core';
import Link from 'next/link';

interface CalendarHeaderProps {
  title: string;
  prevHandler: () => void;
  nextHandler: () => void;
  todayHandler: () => void;
}

export default function CalendarHeader({
  title,
  prevHandler,
  nextHandler,
  todayHandler,
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
          data={[
            {
              value: 'day',
              label: (
                <Center>
                  <Link href="/calendar/day">Day</Link>
                </Center>
              ),
            },
            {
              value: 'week',
              label: (
                <Center>
                  <Link href="/calendar">Week</Link>
                </Center>
              ),
            },
            // {
            //   value: 'month',
            //   label: (
            //     <Center>
            //       <Link href="/calendar/month">Month</Link>
            //     </Center>
            //   ),
            // },
            // {
            //   value: 'year',
            //   label: (
            //     <Center>
            //       <Link href="/calendar/year">Year</Link>
            //     </Center>
            //   ),
            // },
            // {
            //   value: 'schedule',
            //   label: (
            //     <Center>
            //       <Link href="/calendar/schedule">Schedule</Link>
            //     </Center>
            //   ),
            // },
          ]}
        />

        <button
          className="h-full rounded-lg p-2 text-3xl hover:bg-blue-300/20"
          onClick={prevHandler}
        >
          <ChevronLeftIcon className="w-4" />
        </button>
        <button
          onClick={todayHandler}
          className="cursor-pointer rounded-lg p-2 text-lg font-semibold hover:bg-blue-300/20"
        >
          Today
        </button>
        <button
          className="h-full rounded-lg p-2 text-3xl hover:bg-blue-300/20"
          onClick={nextHandler}
        >
          <ChevronRightIcon className="w-4" />
        </button>
      </div>
    </div>
  );
}
