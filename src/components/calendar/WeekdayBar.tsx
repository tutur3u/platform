import { useCalendar } from '../../hooks/useCalendar';
import DayTitle from './DayTitle';

const WeekdayBar = () => {
  const { getDatesInView } = useCalendar();
  const days = getDatesInView();

  const getGridCols = () => {
    switch (days.length) {
      case 1:
        return 'grid-cols-1';

      case 4:
        return 'grid-cols-4';

      case 7:
        return 'grid-cols-7';

      default:
        return 'grid-cols-7';
    }
  };

  return (
    <div className="flex">
      <div className="flex w-16 items-center justify-center border-b border-zinc-800 font-semibold">
        ICT
      </div>
      <div className={`grid flex-1 ${getGridCols()}`}>
        {days.map((weekday, index) => (
          <div key={index}>
            <DayTitle
              date={days[index]}
              weekday={weekday.toLocaleString('en-us', { weekday: 'short' })}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default WeekdayBar;
