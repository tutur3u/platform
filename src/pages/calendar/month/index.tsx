import { ReactElement, useEffect, useState } from 'react';
import { useAppearance } from '../../../hooks/useAppearance';
import { useUserList } from '../../../hooks/useUserList';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import Layout from '../../../components/layout/Layout';
import { useUserData } from '../../../hooks/useUserData';
import Month from '../../../components/calendar/Month';
import CalendarHeader from '../../../components/calendar/CalendarHeader';

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

  const title = `${longMonth} ${date.getFullYear()}`;

  return (
    <div className="flex h-full min-h-full w-full flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <CalendarHeader
        title={title}
        prevHandler={prevMonth}
        nextHandler={nextMonth}
        todayHandler={setToday}
      />

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
