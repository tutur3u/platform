import DayPlanner from './day-planner';
import TimeColumn from './time-column';

export default function DatePlanner({
  dates,
  start,
  end,
}: {
  dates?: string[];
  start?: number;
  end?: number;
}) {
  if (!start || !end) return null;

  return (
    <div className="mt-4 flex items-start justify-center gap-2">
      <TimeColumn start={start} end={end} />
      {dates?.map((d) => (
        <DayPlanner key={d} date={d} start={start} end={end} />
      ))}
    </div>
  );
}
