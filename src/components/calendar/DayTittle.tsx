interface DayTitleProps {
  date: string;
  weekday: string;
}

export default function DayTitle({ date, weekday }: DayTitleProps) {
  return (
    <div>
      <div className="flex h-20 flex-col items-center justify-center text-xl font-semibold text-purple-500/70">
        {weekday}
        <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/70 text-2xl text-white">
          {date}
        </span>
      </div>
    </div>
  );
}
