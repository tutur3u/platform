import { ReactElement, useEffect, useState } from 'react';
import { useAppearance } from '../../../hooks/useAppearance';
import { useUserList } from '../../../hooks/useUserList';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import Layout from '../../../components/layout/Layout';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import MonthCell from '../../../components/calendar/MonthCell';

const MonthViewPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useAppearance();
  const { clearUsers } = useUserList();

  useEffect(() => {
    setRootSegment({
      content: 'Calendar',
      href: '/expenses',
    });

    clearUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [date, setDate] = useState(new Date());

  const shortMonthName = new Intl.DateTimeFormat('en-US', { month: 'long' })
    .format;
  const longMonth = shortMonthName(date); // "July"

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // get first day of the month
  const getFirstDay = () => {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    return firstDay;
  };

  // get last day of the month
  const getLastDay = () => {
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return lastDay;
  };

  // get the difference between the first and last day of the month
  const getDayDifference = () => {
    const firstDay = getFirstDay();
    const lastDay = getLastDay();
    const difference = lastDay.getDate() - firstDay.getDate();
    return difference;
  };

  // get prefixDays
  const getPrefixDays = () => {
    const firstDay = getFirstDay();
    const prefixDays = firstDay.getDay() - 1;
    return prefixDays == -1 ? 6 : prefixDays;
  };

  // get suffixDays
  const getSuffixDays = () => {
    const lastDay = getLastDay();
    const suffixDays = 7 - lastDay.getDay();
    return suffixDays == 7 ? 0 : suffixDays;
  };

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


  return (
    <div className="flex h-full min-h-full w-full flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <div className="mb-8 flex justify-between">
        <div className="text-3xl font-semibold">
          {longMonth} <span>{date.getFullYear()}</span>
        </div>

        <div className="flex items-center justify-center gap-2 text-blue-300">
          <button
            onClick={prevMonth}
            className="h-full rounded-lg bg-blue-300/10 p-2 text-3xl hover:bg-blue-300/20"
          >
            <ChevronLeftIcon className="w-4" />
          </button>
          <button className="cursor-pointer rounded-lg bg-blue-300/10 p-2 text-lg font-semibold hover:bg-blue-300/20">
            This month
          </button>
          <button
            onClick={nextMonth}
            className="h-full rounded-lg bg-blue-300/10 p-2 text-3xl hover:bg-blue-300/20"
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

      <div className="grid h-full grid-cols-7 border-t border-l border-zinc-800">
        {Array.from({ length: getPrefixDays() }).map((_, index) => (
          <MonthCell key={index} />
        ))}

        {Array.from({ length: getDayDifference() + 1 }).map((_, index) => (
          <MonthCell key={index} date={index + 1} />
        ))}

        {Array.from({ length: getSuffixDays() }).map((_, index) => (
          <MonthCell key={index} />
        ))}
      </div>
    </div>
  );
};

MonthViewPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default MonthViewPage;
