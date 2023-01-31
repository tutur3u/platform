interface DayTitleProps {
  date: Date;
  weekday: string;
}

export default function DayTitle({ date, weekday }: DayTitleProps) {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  return (
    <div
      className={`flex h-20 flex-col items-center justify-center border-b border-l border-zinc-800 pb-2 text-xl font-semibold ${
        isToday ? 'text-blue-300' : ''
      }`}
    >
      {weekday}
      <span
        className={`${
          isToday ? 'bg-blue-300/30 text-blue-300' : 'text-white'
        } mt-1 flex aspect-square items-center justify-center rounded-full p-1 text-xl`}
      >
        {date.getDate()}
      </span>
    </div>
  );
}
