import DayTitle from './DayTitle';
import useTranslation from 'next-translate/useTranslation';

const WeekdayBar = ({
  view,
  dates,
}: {
  view: 'day' | '4-days' | 'week';
  dates: Date[];
}) => {
  const { lang } = useTranslation();

  const getGridCols = () => {
    switch (dates.length) {
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
      <div className="border-border flex w-14 items-center justify-center rounded-tl-lg border border-r-0 font-semibold md:w-20 dark:border-zinc-800">
        ICT
      </div>
      <div
        className={`border-border grid flex-1 rounded-tr-lg border-r border-t dark:border-zinc-800 ${getGridCols()}`}
      >
        {dates.map((weekday, index) => (
          <div
            key={`date-${weekday.toLocaleString(lang, {
              weekday: 'short',
            })}`}
          >
            <DayTitle
              view={view}
              date={dates[index]!}
              weekday={weekday.toLocaleString(lang, {
                weekday: lang === 'vi' ? 'narrow' : 'short',
              })}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default WeekdayBar;
