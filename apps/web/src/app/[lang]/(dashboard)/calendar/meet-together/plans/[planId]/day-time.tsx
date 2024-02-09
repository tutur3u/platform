import { useTimeBlocking } from './time-blocking-provider';

export default function DayTime({
  date,
  start,
  end,
  editable,
  disabled,
}: {
  date: string;
  start: number;
  end: number;
  editable: boolean;
  disabled: boolean;
}) {
  const hourBlocks = Array.from(Array(Math.floor(end + 1 - start)).keys());

  const {
    editing,
    startEditing,
    endEditing,
    toggleTimeBlock,
    selectedTimeBlocks,
  } = useTimeBlocking();

  const isTimeBlockSelected = (i: number) =>
    selectedTimeBlocks.get(date)?.includes(i) ?? false;

  return (
    <div className="border-foreground/50 relative w-12 border border-b-0">
      {hourBlocks
        .map((i) => (i + start) * 4)
        // duplicate each item 4 times
        .flatMap((i) => [i, i, i, i])
        .map((_, i, array) => (
          <div
            key={`${date}-${i}`}
            onMouseDownCapture={
              editable && !disabled
                ? () =>
                    startEditing({
                      selecting: !isTimeBlockSelected(i),
                      start: {
                        date,
                        timeBlock: i,
                      },
                    })
                : undefined
            }
            onMouseUpCapture={editable && !disabled ? endEditing : undefined}
            onClick={
              editable && !disabled
                ? () => toggleTimeBlock({ date, timeBlock: i })
                : undefined
            }
            onMouseMove={
              editable && !disabled
                ? () => {
                    if (editing) toggleTimeBlock({ date, timeBlock: i });
                  }
                : undefined
            }
            onDrag={
              editable && !disabled ? (e) => e.preventDefault() : undefined
            }
            onSelect={
              editable && !disabled ? (e) => e.preventDefault() : undefined
            }
            className={`${
              i + 4 <= array.length - 1
                ? isTimeBlockSelected(i)
                  ? 'bg-green-500/70'
                  : editable
                    ? 'bg-red-500/20'
                    : 'bg-foreground/10'
                : ''
            } relative h-2 w-full ${
              i === 0 || i + 4 > array.length - 1
                ? ''
                : (i + 1) % 4 === 0
                  ? 'border-foreground/50 border-b'
                  : (i + 1) % 2 === 0
                    ? 'border-foreground/50 border-b border-dashed'
                    : ''
            }`}
          />
        ))}
    </div>
  );
}
