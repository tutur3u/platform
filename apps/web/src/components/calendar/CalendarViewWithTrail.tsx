import { useEffect } from 'react';
import CalendarView from './CalendarView';
import TimeTrail from './TimeTrail';

const CalendarViewWithTrail = () => {
  // On mount, scroll to current time
  useEffect(() => {
    const component = document.getElementById('calendar-view');
    if (!component) return;

    const now = new Date();
    const minutes = now.getMinutes();
    const hours = now.getHours() + minutes / 60;

    const height = component.clientHeight;
    const scrollPosition = hours * 80 - height / 2;

    component.scrollTo(0, scrollPosition);
  }, []);

  return (
    <div
      id="calendar-view"
      className="scrollbar-none flex overflow-x-hidden overflow-y-scroll scroll-smooth border-b border-zinc-800 text-center"
    >
      <TimeTrail />
      <CalendarView />
    </div>
  );
};

export default CalendarViewWithTrail;
