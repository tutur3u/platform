interface DayTitleProps {
  date: Date;
  weekday: string;
}

export default function DayTitle({ date, weekday }: DayTitleProps) {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  return (
    <div
      className={`flex items-center justify-center gap-1 border-b border-l border-zinc-300 p-2 text-center dark:border-zinc-800 ${
        isToday
          ? 'bg-purple-500/20 text-purple-500 dark:bg-purple-300/10 dark:text-purple-300'
          : 'text-zinc-700 dark:text-zinc-300'
      }`}
    >
      <span className="text-lg font-bold">{weekday}</span>
      <span
        className={`${
          isToday
            ? 'bg-purple-500/20 dark:bg-purple-300/20'
            : 'bg-zinc-500/20 dark:bg-zinc-300/10 dark:text-white'
        } flex aspect-square items-center justify-center rounded px-1 font-semibold`}
      >
        {date.getDate()}
      </span>
    </div>
  );
}
