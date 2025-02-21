'use client';

import CalendarHeader from './CalendarHeader';
import CalendarViewWithTrail from './CalendarViewWithTrail';
import DynamicIsland from './DynamicIsland';
import WeekdayBar from './WeekdayBar';
import { CalendarProvider } from '@/hooks/useCalendar';
import { Workspace } from '@tutur3u/types/primitives/Workspace';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

const Calendar = ({ workspace }: { workspace: Workspace }) => {
  const t = useTranslations('calendar');

  const [initialized, setInitialized] = useState(false);

  const [date, setDate] = useState(new Date());
  const [view, setView] = useState<undefined | 'day' | '4-days' | 'week'>();

  const [dates, setDates] = useState<Date[]>([]);
  const [availableViews, setAvailableViews] = useState<
    { value: string; label: string; disabled?: boolean }[]
  >([]);

  useEffect(() => {
    if (initialized) return;

    setInitialized(true);
    setAvailableViews([
      {
        value: 'day',
        label: t('day'),
        disabled: false,
      },
      {
        value: '4-days',
        label: t('4-days'),
        disabled: window.innerWidth <= 768,
      },
      {
        value: 'week',
        label: t('week'),
        disabled: window.innerWidth <= 768,
      },
    ]);
  }, [t, initialized]);

  // Update the date's hour and minute, every minute
  useEffect(() => {
    // calculate seconds to next minute
    const secondsToNextMinute = 60 - new Date().getSeconds();

    // Make sure the date is updated at the start of the next minute
    const timeout = setTimeout(() => {
      setDate((date) => {
        const newDate = new Date(date);

        newDate.setHours(new Date().getHours());
        newDate.setMinutes(new Date().getMinutes());

        return newDate;
      });

      // And then update it every minute
      const interval = setInterval(() => {
        setDate((date) => {
          const newDate = new Date(date);

          newDate.setHours(new Date().getHours());
          newDate.setMinutes(new Date().getMinutes());

          return newDate;
        });
      }, 60000);

      return () => clearInterval(interval);
    }, secondsToNextMinute * 1000);

    return () => clearTimeout(timeout);
  }, []);

  const enableDayView = useCallback(() => {
    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);
    setView('day');
    setDates([newDate]);
  }, [date]);

  // const enable4DayView = () => {
  //   const dates: Date[] = [];

  //   for (let i = 0; i < 4; i++) {
  //     const newDate = new Date(date);
  //     newDate.setHours(0, 0, 0, 0);
  //     newDate.setDate(newDate.getDate() + i);
  //     dates.push(newDate);
  //   }

  //   setDates(dates);
  // };

  const enableWeekView = useCallback(() => {
    const getMonday = () => {
      const day = date.getDay() || 7;
      const newDate = new Date(date);
      if (day !== 1) newDate.setHours(-24 * (day - 1));
      return newDate;
    };

    const getWeekdays = () => {
      const monday = getMonday();
      const dates: Date[] = [];

      for (let i = 0; i < 7; i++) {
        const newDate = new Date(monday);
        newDate.setHours(0, 0, 0, 0);
        newDate.setDate(newDate.getDate() + i);
        dates.push(newDate);
      }
      return dates;
    };

    setView('week');
    setDates(getWeekdays());
  }, [date]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) enableDayView();
      else enableWeekView();
    };

    // Call handleResize directly to handle the case when the component mounts
    handleResize();

    // Add event listener for window resize
    window.addEventListener('resize', handleResize);

    // Cleanup function to remove the event listener when the component unmounts
    return () => window.removeEventListener('resize', handleResize);
  }, [enableDayView, enableWeekView]);

  if (!initialized || !view || !dates.length) return null;

  return (
    <CalendarProvider ws={workspace}>
      <div className="grid h-[calc(100%-4rem)] w-full md:pb-4">
        <CalendarHeader
          availableViews={availableViews}
          date={date}
          setDate={setDate}
          view={view}
          offset={view === 'day' ? 1 : view === '4-days' ? 4 : 7}
        />
        <WeekdayBar view={view} dates={dates} />
        <CalendarViewWithTrail dates={dates} />
        <DynamicIsland />
      </div>
    </CalendarProvider>
  );
};

export default Calendar;
