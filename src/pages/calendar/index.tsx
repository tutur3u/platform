import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';
import { ReactElement, useEffect, useState } from 'react';
import DayTitle from '../../components/calendar/DayTitle';
import Layout from '../../components/layout/Layout';
import { useAppearance } from '../../hooks/useAppearance';
import { useUserData } from '../../hooks/useUserData';
import { useUserList } from '../../hooks/useUserList';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import HeaderX from '../../components/metadata/HeaderX';
import CalendarHeader from '../../components/calendar/CalendarHeader';
import EventCard from '../../components/calendar/EventCard';
import tasks from '../../data/tasks';

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

  const [days, setDays] = useState([
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
  ]);

  const onDayMode = () => {
    const currentDay = new Date(date).toLocaleString('en-US', {
      weekday: 'long',
    });

    setDays([currentDay]);
  };

  const onWeekMode = () => {
    setDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  };

  const setToday = () => {
    setDate(new Date());

    if (days.length === 1)
      setDays([new Date().toLocaleString('en-US', { weekday: 'long' })]);
  };

  const setPrev = () => {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() - days.length);
    setDate(newDate);

    if (days.length === 1)
      setDays([newDate.toLocaleString('en-US', { weekday: 'long' })]);
  };

  const setNext = () => {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() + days.length);
    setDate(newDate);

    if (days.length === 1)
      setDays([newDate.toLocaleString('en-US', { weekday: 'long' })]);
  };

  const getMonday = () => {
    const day = date.getDay() || 7;
    const newDate = new Date(date);
    if (day !== 1) newDate.setHours(-24 * (day - 1));
    return newDate;
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

  const title = date.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // Place the tasks on the calendar
  const placeTasks = () => {
    const weekdays = getWeekdays();

    const tasksOnCalendar = weekdays.map((day) => {
      const tasksOnDay = tasks.filter((task) => {
          if (task.start.getDate() === day.getDate()) return true;
          return false;
        }),
        tasksOnDayPlaced: {
          id: number;
          title: string;
          duration: number;
          startAt: number;
        }[] = [];

      tasksOnDay.forEach((task) => {
        const taskStart = task.start.getHours() + task.start.getMinutes() / 60;
        const taskEnd = task.end.getHours() + task.end.getMinutes() / 60;

        const taskDuration = taskEnd - taskStart;

        const taskPlaced = {
          id: task.id,
          title: task.title,
          duration: taskDuration,
          startAt: taskStart,
        };

        tasksOnDayPlaced.push(taskPlaced);
      });

      return {
        day,
        tasks: tasksOnDayPlaced,
      };
    });

    console.log(tasksOnCalendar);

    return tasksOnCalendar;
  };

  return (
    <>
      <HeaderX label="Calendar" />
      <div className="flex h-full w-full flex-col border-zinc-800 bg-zinc-900 p-6">
        <CalendarHeader
          title={title}
          prevHandler={setPrev}
          nextHandler={setNext}
          todayHandler={setToday}
          dayModeHandler={onDayMode}
          weekModeHandler={onWeekMode}
        />

        <div className="flex">
          <div className="flex w-16 items-center justify-center border-b border-zinc-800 font-semibold">
            ICT
          </div>
          <div
            className={`grid flex-1 ${
              days.length === 1 ? 'grid-cols-1' : 'grid-cols-7'
            }`}
          >
            {days.map((weekday, index) => (
              <div key={index}>
                <DayTitle
                  date={days.length === 1 ? date : getWeekdays()[index]}
                  weekday={weekday}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex overflow-y-scroll border-b border-zinc-800 text-center scrollbar-none">
          <div className="grid w-16 grid-rows-[24]">
            {Array.from(Array(24).keys()).map((hour, index) => (
              <div
                key={index}
                className={`relative flex h-20 w-full min-w-fit items-center justify-end text-xl font-semibold ${
                  hour === 23 ? 'border-b border-zinc-800' : 'translate-y-3'
                }`}
              >
                <span className="absolute right-0 bottom-0 px-2">
                  {hour < 23 ? hour + 1 + ':00' : null}
                </span>
              </div>
            ))}
          </div>

          <div
            className={`relative grid flex-1 ${
              days.length === 1 ? 'grid-cols-1' : 'grid-cols-7'
            }`}
          >
            {days.map((_, index) => (
              <div key={index} className="grid grid-rows-[24]">
                {Array.from(Array(24).keys()).map((index) => (
                  <div
                    key={index}
                    className="grid h-20 border-l border-b border-zinc-800"
                  />
                ))}
              </div>
            ))}

            <div
              className={`absolute inset-0 grid ${
                days.length === 1 ? 'grid-cols-1' : 'grid-cols-7'
              }`}
            >
              {(days.length === 1
                ? placeTasks().filter(
                    (day) => day.day.getDate() === date.getDate()
                  )
                : placeTasks()
              ).map((day, index) => (
                <div key={index} className="relative grid grid-rows-[24]">
                  {day.tasks.map((task, index) => (
                    <EventCard key={index} task={task} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

CalendarPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default CalendarPage;
