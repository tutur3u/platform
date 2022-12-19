import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';
import { Center, SegmentedControl } from '@mantine/core';
import Link from 'next/link';
import { ReactElement, useEffect, useState } from 'react';
import DayTitle from '../../components/calendar/DayTitle';
import Layout from '../../components/layout/Layout';
import { useAppearance } from '../../hooks/useAppearance';
import { useUserData } from '../../hooks/useUserData';
import { useUserList } from '../../hooks/useUserList';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const supabase = createServerSupabaseClient(ctx);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session)
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };

  return {
    props: {
      initialSession: session,
      user: session.user,
    },
  };
};

const CalendarPage: PageWithLayoutProps = () => {
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
      enablePadding();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (data) updateUsers([data]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const [date, setDate] = useState(new Date());

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const setToday = () => {
    setDate(new Date());
  };

  const setPreviousWeek = () => {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() - 7);
    setDate(newDate);
  };

  const setNextWeek = () => {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() + 7);
    setDate(newDate);
  };

  const getMonday = () => {
    const day = date.getDay() || 7;
    if (day !== 1) {
      date.setHours(-24 * (day - 1));
    }
    return date;
  };

  // get other date from monday to sunday
  const getWeekdays = () => {
    const monday = getMonday();
    const days = [];

    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const shortMonthName = new Intl.DateTimeFormat('en-US', { month: 'long' })
    .format;
  const longMonth = shortMonthName(date); // "July"

  const isDev = process.env.NODE_ENV === 'development';

  if (!isDev)
    return (
      <div className="h-full min-h-full w-full p-8">
        <div className="flex h-full w-full items-center justify-center rounded-lg border border-purple-300/20 bg-purple-300/10 text-6xl font-semibold text-purple-300">
          Under construction 🚧
        </div>
      </div>
    );

  return (
    <div className="flex h-full w-full flex-col border-zinc-800 bg-zinc-900 p-6">
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
            onClick={setPreviousWeek}
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
            onClick={setNextWeek}
            className="h-full rounded-lg p-2 text-3xl hover:bg-blue-300/20"
          >
            <ChevronRightIcon className="w-4" />
          </button>
        </div>
      </div>

      <div className="relative mb-20 bg-red-200">
        <div className="absolute right-0 grid w-[93%] grid-cols-7">
          {weekdays.map((weekday, index) => (
            <div key={index}>
              <DayTitle date={getWeekdays()[index]} weekday={weekday} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex overflow-y-scroll border-zinc-800 bg-red-200 text-center scrollbar-none">
        <div className="absolute left-0 grid w-[7%] grid-rows-[24] overflow-y-scroll">
          {Array.from(Array(23).keys()).map((hour, index) => (
            <div
              key={index}
              className="relative flex h-20 w-full min-w-fit items-center justify-end border-b border-zinc-800 text-xl font-semibold"
            >
              <span className="absolute right-0 bottom-0 px-2">
                {hour + 1}:00
              </span>
            </div>
          ))}
        </div>
        <div className="absolute right-0 grid w-[93%] grid-cols-7">
          {weekdays.map((_, index) => (
            <div key={index}>
              <div className="grid grid-rows-[24]">
                {Array.from(Array(24).keys()).map((index) => (
                  <div
                    key={index}
                    className="flex h-20 items-center justify-center border-l border-b border-zinc-800"
                  ></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

CalendarPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default CalendarPage;
