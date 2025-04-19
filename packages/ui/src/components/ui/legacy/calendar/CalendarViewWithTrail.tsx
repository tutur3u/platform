import CalendarView from './CalendarView';
import TimeTrail from './TimeTrail';
import { HOUR_HEIGHT } from './config';
import { useEffect, useRef, useState } from 'react';

const CalendarViewWithTrail = ({ dates }: { dates: Date[] }) => {
  const [initialized, setInitialized] = useState(false);
  const calendarViewRef = useRef<HTMLDivElement>(null);

  // Scroll to current time on mount and when dates change
  useEffect(() => {
    const scrollToCurrentTime = () => {
      if (initialized) return;

      const component = calendarViewRef.current;
      if (!component) return;

      const now = new Date();
      const minutes = now.getMinutes();
      const hours = now.getHours() + minutes / 60;

      // Calculate scroll position to center the current time in the viewport
      const height = component.clientHeight;
      const scrollPosition = Math.max(0, hours * HOUR_HEIGHT - height / 2);

      // Use smooth scrolling for better UX
      component.scrollTo({
        top: scrollPosition,
        behavior: 'smooth',
      });

      setInitialized(true);
    };

    // Initial scroll
    scrollToCurrentTime();

    // Set up a timer to update the scroll position every minute
    const intervalId = setInterval(scrollToCurrentTime, 60000);

    return () => clearInterval(intervalId);
  }, [dates, initialized]);

  return (
    <div
      ref={calendarViewRef}
      id="calendar-view"
      className="border-border flex h-full overflow-y-auto scroll-smooth rounded-b-lg border-b border-l text-center dark:border-zinc-800"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(0,0,0,0.2) transparent',
      }}
    >
      <TimeTrail />
      <CalendarView dates={dates} />
    </div>
  );
};

export default CalendarViewWithTrail;
