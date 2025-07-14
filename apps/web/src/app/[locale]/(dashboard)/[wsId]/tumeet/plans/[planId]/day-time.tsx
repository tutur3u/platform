import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';

export default function DayTime({
  timeblocks,
  date,
  start,
  end,
  editable,
  disabled,
}: {
  timeblocks: Timeblock[];
  date: string;
  start: number;
  end: number;
  editable: boolean;
  disabled: boolean;
}) {
  // Simplified version - full implementation would include interactive time blocks
  const hourBlocks = Array.from(Array(Math.floor(end + 1 - start)).keys());
  const hourSplits = 4;

  return (
    <div className="flex flex-col">
      {hourBlocks.map((hour) => (
        <div key={hour} className="flex flex-col">
          {Array.from({ length: hourSplits }).map((_, split) => (
            <div
              key={`${hour}-${split}`}
              className="h-4 w-12 border border-foreground/20 bg-background hover:bg-foreground/5"
              style={{
                backgroundColor: disabled ? '#f5f5f5' : 'transparent',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
