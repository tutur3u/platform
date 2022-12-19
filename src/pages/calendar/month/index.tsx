import { ReactElement, useEffect, useState } from 'react';
import { useAppearance } from '../../../hooks/useAppearance';
import { useUserList } from '../../../hooks/useUserList';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import Layout from '../../../components/layout/Layout';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { useUserData } from '../../../hooks/useUserData';
import Link from 'next/link';
import { Center, SegmentedControl } from '@mantine/core';
import Month from '../../../components/calendar/Month';

const MonthViewPage: PageWithLayoutProps = () => {
  const {
    setRootSegment,
    changeLeftSidebarSecondaryPref,
    disablePadding,
    enablePadding,
  } = useAppearance();
  const { updateUsers } = useUserList();
  const { data } = useUserData();

  useEffect(() => {
    changeLeftSidebarSecondaryPref('visible');
    disablePadding();

    setRootSegment({
      content: 'Calendar',
      href: '/expenses',
    });

    return () => {
      changeLeftSidebarSecondaryPref('hidden');
      enablePadding();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (data) updateUsers([data]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const [date, setDate] = useState(new Date());

  const longMonthName = new Intl.DateTimeFormat('en-US', { month: 'long' })
    .format;
  const longMonth = longMonthName(date); // "July"

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // // get first day of the month
  // const getFirstDay = () => {
  //   const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  //   return firstDay;
  // };

  // // get monday of the week of the first day of the month
  // const getFirstMonday = () => {
  //   const firstDay = getFirstDay();
  //   const firstMonday = new Date(
  //     firstDay.getFullYear(),
  //     firstDay.getMonth(),
  //     firstDay.getDate() - firstDay.getDay() + 1
  //   );
  //   return firstMonday;
  // };

  // // get last day of the month
  // const getLastDay = () => {
  //   const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  //   return lastDay;
  // };

  // // get week of the last day of month
  // const getLastWeek = () => {
  //   const lastDay = getLastDay();
  //   const lastWeek = lastDay.getDay();
  //   return lastWeek;
  // };

  // // get sunday of the week of the last day of the month
  // const getLastDayOfLastWeek = () => {
  //   const lastDay = getLastDay();
  //   const lastWeek = getLastWeek();
  //   const lastDayOfLastWeek = new Date(
  //     lastDay.getFullYear(),
  //     lastDay.getMonth(),
  //     lastDay.getDate() + (6 - lastWeek)
  //   );
  //   return lastDayOfLastWeek;
  // };

  // // get other date from first monday to the last day of last week
  // const getMonthDays = () => {
  //   const firstMonday = getFirstMonday();
  //   const lastDayOfLastWeek = getLastDayOfLastWeek();
  //   const days = [];
  //   for (
  //     let i = firstMonday;
  //     i <= lastDayOfLastWeek;
  //     i.setDate(i.getDate() + 1)
  //   ) {
  //     days.push(new Date(i));
  //   }
  //   return days;
  // };

  // // get the difference between the first monday and the last day of last week
  // const getMonthDaysLength = () => {
  //   const firstMonday = getFirstMonday();
  //   const lastDayOfLastWeek = getLastDayOfLastWeek();
  //   const daysLength =
  //     (lastDayOfLastWeek.getTime() - firstMonday.getTime()) /
  //     (1000 * 3600 * 24);
  //   return daysLength;
  // };

  // prevMonth
  const prevMonth = () => {
    const newDate = new Date(date);
    newDate.setMonth(newDate.getMonth() - 1);
    setDate(newDate);
  };

  // nextMonth
  const nextMonth = () => {
    const newDate = new Date(date);
    newDate.setMonth(newDate.getMonth() + 1);
    setDate(newDate);
  };

  // set date to today
  const setToday = () => {
    setDate(new Date());
  };

  return (
    <div className="flex h-full min-h-full w-full flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <div className="mb-8 flex justify-between">
        <div className="text-3xl font-semibold">
          {longMonth} <span>{date.getFullYear()}</span>
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
              {
                value: 'month',
                label: (
                  <Center>
                    <Link href="/calendar/month">Month</Link>
                  </Center>
                ),
              },
              {
                value: 'year',
                label: (
                  <Center>
                    <Link href="/calendar/year">Year</Link>
                  </Center>
                ),
              },
              {
                value: 'schedule',
                label: (
                  <Center>
                    <Link href="/calendar/schedule">Schedule</Link>
                  </Center>
                ),
              },
            ]}
          />

          <button
            onClick={prevMonth}
            className="h-full rounded-lg p-2 text-3xl hover:bg-blue-300/20"
          >
            <ChevronLeftIcon className="w-4" />
          </button>
          <button
            onClick={setToday}
            className="cursor-pointer rounded-lg p-2 text-lg font-semibold hover:bg-blue-300/20"
          >
            Today
          </button>
          <button
            onClick={nextMonth}
            className="h-full rounded-lg p-2 text-3xl hover:bg-blue-300/20"
          >
            <ChevronRightIcon className="w-4" />
          </button>
        </div>
      </div>

      <div>
        <div className="grid grid-cols-7">
          {weekdays.map((weekday) => (
            <div key={weekday} className="text-center text-xl">
              {weekday}
            </div>
          ))}
        </div>
      </div>

      {/* <div className="grid h-full grid-cols-7 border-t border-l border-zinc-800">
        {Array.from({ length: getMonthDaysLength() + 1 }).map((_, index) => (
          <MonthCell hasGrid={true} key={index} date={getMonthDays()[index]} />
        ))}
      </div> */}

      <div className="h-full">
        <Month
          hasGrid={true}
          month={date.getMonth()}
          year={date.getFullYear()}
        />
      </div>
    </div>
  );
};

MonthViewPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default MonthViewPage;
