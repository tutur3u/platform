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
      <div className="flex w-14 items-center justify-center rounded-tl-lg border border-r-0 border-zinc-300 font-semibold dark:border-zinc-800 md:w-20">
        ICT
      </div>
      <div
        className={`grid flex-1 rounded-tr-lg border-r border-t border-zinc-300 dark:border-zinc-800 ${getGridCols()}`}
      >
        {days.map((weekday, index) => (
          <div
            key={`date-${weekday.toLocaleString('en-us', {
              weekday: 'short',
            })}`}
          >
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
