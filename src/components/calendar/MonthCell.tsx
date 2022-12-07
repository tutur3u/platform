interface MonthCellProps {
  date?: number;
  key: number;
}

export default function MonthCell({ date, key }: MonthCellProps) {
  const today = new Date();

  // check if today is the same as the date
  const isToday = today.getDate() === date;

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
        {date}
      </span>
    </div>
  );
}
