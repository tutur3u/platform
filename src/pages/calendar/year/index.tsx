import { ReactElement, useEffect, useState } from 'react';
import CalendarHeader from '../../../components/calendar/CalendarHeader';
import Month from '../../../components/calendar/Month';
import Layout from '../../../components/layout/Layout';
import { useAppearance } from '../../../hooks/useAppearance';
import { useUserData } from '../../../hooks/useUserData';
import { useUserList } from '../../../hooks/useUserList';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';

const YearViewPage: PageWithLayoutProps = () => {
  const { setRootSegment, changeLeftSidebarSecondaryPref } = useAppearance();
  const { updateUsers } = useUserList();
  const { data } = useUserData();

  useEffect(() => {
    changeLeftSidebarSecondaryPref('visible');

    setRootSegment({
      content: 'Calendar',
      href: '/expenses',
    });
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

  const nextYear = () => {
    setDate(new Date(date.getFullYear() + 1, date.getMonth()));
  };

  const prevYear = () => {
    setDate(new Date(date.getFullYear() - 1, date.getMonth()));
  };

  // array of months as number
  const months = Array.from({ length: 12 }, (_, i) => i);

  // get current year
  const getYear = () => {
    const year = date.getFullYear();
    return year;
  };

  const title = `${date.getFullYear()}`;

  return (
    <div className="flex h-full min-h-full w-full flex-col overflow-y-scroll border border-zinc-800 bg-zinc-900 p-5">
      <CalendarHeader
        title={title}
        prevHandler={prevYear}
        nextHandler={nextYear}
        todayHandler={setToday}
      />

      {/* <div className="overflow-scroll-y bg-red-800 text-center scrollbar-none"> */}
      <div className="overflow-scroll-y grid grid-cols-1 gap-7 text-center md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((month) => (
          <Month key={month} month={month} year={getYear()} hasGrid={false} />
        ))}
      </div>
      {/* </div> */}
    </div>
  );
};

YearViewPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default YearViewPage;
