interface DayTitleProps {
  date: Date;
  weekday: string;
}

export default function DayTitle({ date, weekday }: DayTitleProps) {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  return (
    <div
      className={`flex h-20 flex-col items-center justify-center border-b border-l border-zinc-300 pb-2 text-xl font-semibold dark:border-zinc-800 ${
        isToday
          ? 'text-blue-600 dark:text-blue-300'
          : 'text-zinc-700 dark:text-zinc-300'
      }`}
    >
      {weekday}
      <span
        className={`${
          isToday
            ? 'bg-blue-500/30 text-blue-600 dark:bg-blue-300/30 dark:text-blue-300'
            : 'dark:text-white'
        } mt-1 flex aspect-square items-center justify-center rounded-full p-1 text-xl`}
      >
        {date.getDate()}
      </span>
    </div>
  );
}
