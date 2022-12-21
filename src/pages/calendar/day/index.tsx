import { ReactElement, useEffect, useState } from 'react';
import CalendarHeader from '../../../components/calendar/CalendarHeader';
import Layout from '../../../components/layout/Layout';
import { useAppearance } from '../../../hooks/useAppearance';
import { useUserData } from '../../../hooks/useUserData';
import { useUserList } from '../../../hooks/useUserList';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';

const DayViewPage: PageWithLayoutProps = () => {
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

  const setToday = () => {
    setDate(new Date());
  };

  // day in type December 13, 2022
  const dayString = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);

  // set prev day
  const prevDay = () => {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() - 1);
    setDate(newDate);
  };

  // set next day
  const nextDay = () => {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() + 1);
    setDate(newDate);
  };

  return (
    <div className="flex h-full min-h-full w-full flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <CalendarHeader
        title={dayString}
        prevHandler={prevDay}
        nextHandler={nextDay}
        todayHandler={setToday}
      />

      <div className="flex overflow-y-scroll scrollbar-none">
        <div className="grid w-[7%] grid-rows-[24]">
          {Array.from(Array(23).keys()).map((hour, index) => (
            <div
              key={index}
              className="relative flex h-20 w-full items-center justify-end border-b border-zinc-800 text-xl font-semibold"
            >
              <span className="absolute bottom-0 right-0 px-2">
                {hour + 1}:00
              </span>
            </div>
          ))}
        </div>
        <div className="grid w-[93%] grid-rows-[24]">
          {Array.from(Array(23).keys()).map((hour, index) => (
            <div
              key={index}
              className="relative flex h-20 items-center justify-end border border-zinc-800 text-2xl font-semibold"
            ></div>
          ))}
        </div>
      </div>
    </div>
  );
};

DayViewPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default DayViewPage;
