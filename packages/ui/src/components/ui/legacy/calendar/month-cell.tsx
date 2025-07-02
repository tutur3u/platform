interface MonthCellProps {
  date: Date;
  key: number;
  hasGrid: boolean;
}

export function MonthCell({ date, key, hasGrid }: MonthCellProps) {
  const today = new Date();

  // check if date is today
  const isToday = date?.toDateString() === today.toDateString();

  return (
    <div
      key={key}
      className={`${
        hasGrid
          ? 'border-zinc-800 border-r border-b font-semibold text-xl'
          : 'text-sm'
      } flex justify-center`}
    >
      <span
        className={`${
          isToday ? 'bg-blue-300/30 text-blue-300' : 'text-white'
        } ${
          hasGrid ? 'my-1 h-10 w-10' : 'h-8 w-8'
        } flex items-center justify-center rounded-full`}
      >
        {date?.getDate()}
      </span>
    </div>
  );
}
