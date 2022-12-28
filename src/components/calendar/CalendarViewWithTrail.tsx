import { useEffect } from 'react';
import CalendarView from './CalendarView';
import TimeTrail from './TimeTrail';

const CalendarViewWithTrail = () => {
  // On mount, scroll to current time
  useEffect(() => {
    const component = document.getElementById('calendar-view');
    if (!component) return;

    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    const scrollPosition = hour * 80 + minute * 1.33;
    component.scrollTo(0, scrollPosition);
  }, []);

  return (
    <div
      id="calendar-view"
      className="flex overflow-y-scroll scroll-smooth border-b border-zinc-800 text-center scrollbar-none"
    >
      <TimeTrail />
      <CalendarView />
    </div>
  );
};

export default CalendarViewWithTrail;
