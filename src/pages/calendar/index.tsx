import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { ReactElement, useEffect, useState } from 'react';
import DayTittle from '../../components/calendar/DayTittle';
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
    <div className="flex h-full min-h-full w-full flex-col rounded-lg bg-purple-300/10 p-5">
      <div className="mb-8 flex h-10 justify-between">
        <div className="text-3xl font-semibold">
          {longMonth} <span>{date.getFullYear()}</span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <ChevronLeftIcon
            onClick={setPreviousWeek}
            className="w-9 rounded-xl p-2 text-3xl hover:cursor-pointer hover:bg-zinc-500"
          ></ChevronLeftIcon>
          <button
            onClick={setToday}
            className="cursor-pointer rounded-xl bg-purple-300/20 p-2 text-lg font-semibold"
          >
            Today
          </button>
          <ChevronRightIcon
            onClick={setNextWeek}
            className="w-9 rounded-xl p-2 text-3xl hover:cursor-pointer hover:bg-zinc-500"
          ></ChevronRightIcon>
        </div>
      </div>
      <div className="grid grid-cols-8">
        <div className="col-span-1"></div>
        {weekdays.map((weekday, index) => (
          <div key={index} className="col-span-1">
            <DayTittle date={getWeekdays()[index]} weekday={weekday} />
          </div>
        ))}
        <div className="col-span-1 flex h-10 items-center justify-center">
          All day
        </div>
        {weekdays.map((weekday, index) => (
          <div key={index} className="col-span-1">
            <div
              key={index}
              className="flex h-10 items-center justify-center border border-zinc-700"
            ></div>
          </div>
        ))}
      </div>
      <div className="overflow-y-scroll text-center scrollbar-none">
        <div className="grid grid-cols-8">
          <div className="col-span-1">
            <div className="grid grid-rows-[24]">
              {Array.from(Array(23).keys()).map((hour, index) => (
                <div
                  key={index}
                  className="flex h-20 items-center justify-center"
                >
                  <span className="translate-y-10">{hour + 1}</span>
                </div>
              ))}
            </div>
          </div>
          {weekdays.map((weekday, index) => (
            <div key={index}>
              <div className="grid grid-rows-[24]">
                {Array.from(Array(24).keys()).map((index) => (
                  <div
                    key={index}
                    className="flex h-20 items-center justify-center border border-zinc-700"
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
