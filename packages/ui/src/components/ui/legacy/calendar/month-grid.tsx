import { MonthCell } from './month-cell';

interface MonthProps {
  hasGrid: boolean;
  month: number;
  year: number;
}

export function Month({ hasGrid, month, year }: MonthProps) {
  // array of months
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  // get the first day of the month prop
  const getFirstDay = () => {
    return new Date(year, month, 1);
  };

  // get monday of the week of the first day of the month
  const getFirstMonday = () => {
    const firstDay = getFirstDay();
    return new Date(
      firstDay.getFullYear(),
      firstDay.getMonth(),
      firstDay.getDate() - firstDay.getDay() + 1
    );
  };

  // get last day of the month prop
  const getLastDay = () => {
    return new Date(year, month + 1, 0);
  };

  // get week of the last day of month
  const getLastWeek = () => {
    const lastDay = getLastDay();
    return lastDay.getDay();
  };

  // get sunday of the week of the last day of the month
  const getLastDayOfLastWeek = () => {
    const lastDay = getLastDay();
    const lastWeek = getLastWeek();
    return new Date(
      lastDay.getFullYear(),
      lastDay.getMonth(),
      lastDay.getDate() + (6 - lastWeek)
    );
  };

  // get other date from first monday to the last day of last week
  const getMonthDays = () => {
    const firstMonday = getFirstMonday();
    const lastDayOfLastWeek = getLastDayOfLastWeek();
    const days: Date[] = [];
    for (
      let i = firstMonday;
      i <= lastDayOfLastWeek;
      i.setDate(i.getDate() + 1)
    ) {
      days.push(new Date(i));
    }
    return days;
  };

  return (
    <div className={`${hasGrid ? 'h-full' : ''} flex flex-col`}>
      {hasGrid || <div>{months[month]}</div>}
      <div
        className={`${
          hasGrid ? `border-t border-l border-zinc-800` : ``
        } grid grid-cols-7`}
      >
        {getMonthDays().map((date) => (
          <MonthCell hasGrid={hasGrid} key={date.getTime()} date={date} />
        ))}
      </div>
    </div>
  );
}
