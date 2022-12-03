import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { ReactElement, useEffect, useState } from 'react';
import DayTitle from '../../components/calendar/DayTitle';
import Layout from '../../components/layout/Layout';
import { useAppearance } from '../../hooks/useAppearance';
import { useUserList } from '../../hooks/useUserList';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';

const CalendarPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useAppearance();
  const { clearUsers } = useUserList();

  const [date, setDate] = useState(new Date());

  useEffect(() => {
    setRootSegment({
      content: 'Calendar',
      href: '/expenses',
    });

    clearUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const longMonth = shortMonthName(date); // "Jul"

  return (
    <div className="flex h-full min-h-full w-full flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <div className="mb-8 flex justify-between">
        <div className="text-3xl font-semibold">
          {longMonth} <span>{date.getFullYear()}</span>
        </div>

        <div className="flex items-center justify-center gap-2 text-blue-300">
          <button
            onClick={setPreviousWeek}
            className="h-full rounded-lg bg-blue-300/10 p-2 text-3xl hover:bg-blue-300/20"
          >
            <ChevronLeftIcon className="w-4" />
          </button>

          <button
            onClick={setToday}
            className="cursor-pointer rounded-lg bg-blue-300/10 p-2 text-lg font-semibold hover:bg-blue-300/20"
          >
            Today
          </button>

          <button
            onClick={setNextWeek}
            className="h-full rounded-lg bg-blue-300/10 p-2 text-3xl hover:bg-blue-300/20"
          >
            <ChevronRightIcon className="w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-8 border-b border-zinc-800">
        <div />
        {weekdays.map((weekday, index) => (
          <div key={index}>
            <DayTitle date={getWeekdays()[index]} weekday={weekday} />
          </div>
        ))}
      </div>

      <div className="overflow-y-scroll border-b border-zinc-800 text-center scrollbar-none">
        <div className="grid grid-cols-8">
          <div>
            <div className="grid grid-rows-[24]">
              {Array.from(Array(23).keys()).map((hour, index) => (
                <div
                  key={index}
                  className="flex h-20 items-center justify-end p-4 text-2xl font-semibold"
                >
                  <span className="translate-y-10">{hour + 1}:00</span>
                </div>
              ))}
            </div>
          </div>
          {weekdays.map((_, index) => (
            <div key={index}>
              <div className="grid grid-rows-[24]">
                {Array.from(Array(24).keys()).map((index) => (
                  <div
                    key={index}
                    className="flex h-20 items-center justify-center border border-zinc-800"
                  />
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
