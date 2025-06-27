import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { Tooltip, TooltipProvider, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import dayjs from 'dayjs';
import { timetzToTime } from '@/utils/date-helper';
import { useTimeBlocking } from './time-blocking-provider';

export default function PreviewDayTime({
  timeblocks: serverTimeblocks,
  date,
  start,
  end,
  disabled,
}: {
  timeblocks: Timeblock[];
  date: string;
  start: number;
  end: number;
  disabled: boolean;
}) {
  const {
    filteredUserIds,
    setPreviewDate,
    getOpacityForDate,
  } = useTimeBlocking();

  const timeblocks =
    filteredUserIds.length > 0
      ? serverTimeblocks.filter(
          (tb) => tb.user_id && filteredUserIds.includes(tb.user_id)
        )
      : serverTimeblocks;

  const hourBlocks = Array.from(Array(Math.floor(end + 1 - start)).keys());
  const hourSplits = 4;

  const isTimeBlockSelected = (i: number): 'local' | 'server' | 'none' => {
    // If the timeblock is pre-selected
    const tb = timeblocks.find((tb) => {
      if (tb.date !== date) return false;

      const startTime = timetzToTime(tb.start_time);
      const endTime = timetzToTime(tb.end_time);

      const [startHour, startMinute] = startTime
        .split(':')
        .map((v) => Number(v) - start);

      const [endHour, endMinute] = endTime
        .split(':')
        .map((v) => Number(v) - start);

      const startBlock =
        Math.floor((startHour ?? 0) * hourSplits + (startMinute ?? 0) / 15) + 1;
      const endBlock = Math.floor(
        (endHour ?? 0) * hourSplits + (endMinute ?? 0) / 15
      );

      return i >= startBlock && i <= endBlock;
    });

    if (tb) return tb.id !== undefined ? 'server' : 'local';
    return 'none';
  };

  return (
    <div className="relative w-14 border border-b-0 border-foreground/50">
      {hourBlocks
        .map((i) => (i + start) * hourSplits)
        // duplicate each item `hourSplits` times
        .flatMap((i) => Array(hourSplits).fill(i))
        .map((_, i, array) => {
          const result = isTimeBlockSelected(i);

          const _isDraft = result.includes('draft');
          const isSaved = result.includes('server');
          const isLocal = result.includes('local');

          const currentDate = dayjs(date)
            .hour(Math.floor(i / hourSplits) + start)
            .minute((i % hourSplits) * 15)
            .toDate();

          const isSelected = isSaved || isLocal || result.includes('add');
          const _isSelectable = i + hourSplits < array.length;
          const _hideBorder = i === 0 || i + hourSplits > array.length - 1;
          const opacity = getOpacityForDate(currentDate, timeblocks);

          const editData = {
            mode: isSelected ? 'remove' : 'add',
            date: currentDate,
          } as const;

          return (
            <TooltipProvider key={`${date}-${i}`} delayDuration={0}>
              <Tooltip disableHoverableContent>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    tabIndex={disabled ? -1 : 0}
                    onMouseOver={
                      disabled
                        ? undefined
                        : (e) => {
                            e.preventDefault();
                            setPreviewDate(editData.date);
                          }
                    }
                    onFocus={
                      disabled ? undefined : () => setPreviewDate(editData.date)
                    }
                    onKeyDown={
                      disabled
                        ? undefined
                        : (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setPreviewDate(editData.date);
                            }
                          }
                    }
                    style={{
                      opacity: isSelected ? opacity : 1,
                    }}
                    className={[
                      'relative h-3 w-full',
                      i + hourSplits < array.length
                        ? isSelected
                          ? isSaved
                            ? 'bg-green-500/70'
                            : 'bg-green-500/70'
                          : 'bg-foreground/10'
                        : '',
                      !_hideBorder
                        ? (i + 1) % hourSplits === 0
                          ? 'border-b border-foreground/50'
                          : (i + 1) % (hourSplits / 2) === 0
                            ? 'border-b border-dashed border-foreground/50'
                            : ''
                        : '',
                    ].join(' ')}
                  />
                </TooltipTrigger>
              </Tooltip>
            </TooltipProvider>
          );
        })}
    </div>
  );
}
