import { cn } from '@tuturuuu/utils/format';

const TimeTrail = () => {
  const hours = Array.from(Array(24).keys());
  return (
    <div className="grid h-fit w-14 grid-rows-[24] border-r border-border md:w-20 dark:border-zinc-800">
      {hours.map((hour) => (
        <div
          key={`trail-hour-${hour}`}
          className="relative flex h-20 w-full min-w-fit items-center justify-end text-sm font-semibold md:text-xl"
        >
          <span
            className={cn(
              'absolute top-0 right-0 px-2',
              hour === 0 ? 'pointer-events-none opacity-0' : '-translate-y-3'
            )}
          >
            {hour === 0
              ? '12:00'
              : hour < 12
                ? `${hour}:00`
                : hour === 12
                  ? '12:00'
                  : `${hour}:00`}
          </span>
        </div>
      ))}
    </div>
  );
};
export default TimeTrail;
