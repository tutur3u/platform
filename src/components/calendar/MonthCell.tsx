interface MonthCellProps {
  date: Date;
  key: number;
}

export default function MonthCell({ date, key }: MonthCellProps) {
  const today = new Date();

  // check if date is today
  const isToday = date?.toDateString() === today.toDateString();

  return (
    <div
      key={key}
      className="flex justify-center border-b border-r border-zinc-800 text-xl"
    >
      <span
        className={`${
          isToday ? ' bg-blue-300/30 text-blue-300' : 'text-white'
        } mt-1 flex h-10 w-10 items-center justify-center rounded-full font-semibold`}
      >
        {date?.getDate()}
      </span>
    </div>
  );
}
