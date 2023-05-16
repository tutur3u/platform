import CalendarHeader from './CalendarHeader';
import CalendarViewWithTrail from './CalendarViewWithTrail';
import WeekdayBar from './WeekdayBar';

const Calendar = () => {
  return (
    <div className="flex h-full w-full flex-col pb-4">
      <CalendarHeader />
      <WeekdayBar />
      <CalendarViewWithTrail />
      {/* <DynamicIsland /> */}
    </div>
  );
};

export default Calendar;
