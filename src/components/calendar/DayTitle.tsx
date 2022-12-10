interface DayTitleProps {
  date: Date;
  weekday: string;
}

export default function DayTitle({ date, weekday }: DayTitleProps) {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  return (
    <div
      className={`flex h-20 flex-col items-center justify-center text-xl font-semibold ${
        isToday ? 'text-blue-300' : ''
      }`}
    >
      {weekday}
      <span
        className={`${
          isToday ? 'bg-blue-300/30 text-blue-300' : 'text-white'
        } mt-1 flex h-10 w-10 items-center justify-center rounded-full text-2xl`}
      >
        {date.getDate()}
      </span>
    </div>
  );
}
