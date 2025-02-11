interface DayTitleProps {
  view: 'day' | '4-days' | 'week';
  date: Date;
  weekday: string;
}

export default function DayTitle({ view, date, weekday }: DayTitleProps) {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  return (
    <div
      className={`border-b border-l border-border text-center font-semibold dark:border-zinc-800 ${
        view !== 'day' ? 'p-1' : 'md:p-1'
      }`}
    >
      <div
        className={`flex items-center justify-center gap-1 rounded p-1 ${
          isToday
            ? `text-purple-500 dark:text-purple-300 ${
                view !== 'day' && 'bg-purple-500/20 dark:bg-purple-300/10'
              }`
            : 'text-zinc-700 dark:text-zinc-300'
        }`}
      >
        <span className="text-lg">{weekday}</span>
        <span
          className={`${
            isToday
              ? 'bg-purple-500/20 dark:bg-purple-300/20'
              : 'bg-zinc-500/20 dark:bg-zinc-300/10 dark:text-white'
          } flex aspect-square items-center justify-center rounded px-1`}
        >
          {date.getDate()}
        </span>
      </div>
    </div>
  );
}
