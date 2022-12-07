import { ReactElement, useEffect, useState } from 'react';
import { useAppearance } from '../../../hooks/useAppearance';
import { useUserList } from '../../../hooks/useUserList';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import Layout from '../../../components/layout/Layout';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';

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
  // const getFirstDay = () => {
  //     const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  //     return firstDay;
  // };

  return (
    <div className="flex h-full min-h-full w-full flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <div className="mb-8 flex justify-between">
        <div className="text-3xl font-semibold">
          {longMonth} <span>{date.getFullYear()}</span>
        </div>

        <div className="flex items-center justify-center gap-2 text-blue-300">
          <button className="h-full rounded-lg bg-blue-300/10 p-2 text-3xl hover:bg-blue-300/20">
            <ChevronLeftIcon className="w-4" />
          </button>
          <button className="cursor-pointer rounded-lg bg-blue-300/10 p-2 text-lg font-semibold hover:bg-blue-300/20">
            This month
          </button>
          <button className="h-full rounded-lg bg-blue-300/10 p-2 text-3xl hover:bg-blue-300/20">
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
        {Array.from(Array(42).keys()).map((index) => (
          <div
            key={index}
            className="items-center justify-end border-b border-r border-zinc-800 text-2xl font-semibold"
          ></div>
        ))}
      </div>
    </div>
  );
};

MonthViewPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default MonthViewPage;
