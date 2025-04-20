import { useTimeBlocking } from './time-blocking-provider';
import { timetzToTime } from '@/utils/date-helper';
import { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { ShieldCheck, ShieldMinus } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import dayjs from 'dayjs';

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
    previewDate,
    setPreviewDate,
    getPreviewUsers,
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
    <div className="border-foreground/50 relative w-14 border border-b-0">
      {hourBlocks
        .map((i) => (i + start) * hourSplits)
        // duplicate each item `hourSplits` times
        .flatMap((i) => Array(hourSplits).fill(i))
        .map((_, i, array) => {
          const result = isTimeBlockSelected(i);

          const isDraft = result.includes('draft');
          const isSaved = result.includes('server');
          const isLocal = result.includes('local');

          const currentDate = dayjs(date)
            .hour(Math.floor(i / hourSplits) + start)
            .minute((i % hourSplits) * 15)
            .toDate();

          const isSelected = isSaved || isLocal || result.includes('add');
          const isSelectable = i + hourSplits < array.length;
          const hideBorder = i === 0 || i + hourSplits > array.length - 1;
          const opacity = getOpacityForDate(currentDate, timeblocks);

          const editData = {
            mode: isSelected ? 'remove' : 'add',
            date: currentDate,
          } as const;

          return (
            <TooltipProvider key={`${date}-${i}`} delayDuration={0}>
              <Tooltip disableHoverableContent>
                <TooltipTrigger asChild>
                  <div
                    onMouseOver={
                      disabled
                        ? undefined
                        : (e) => {
                            e.preventDefault();
                            setPreviewDate(editData.date);
                          }
                    }
                    onTouchStart={
                      disabled
                        ? undefined
                        : (e) => {
                            e.preventDefault();
                            setPreviewDate(editData.date);
                          }
                    }
                    style={{
                      opacity: isSelected ? opacity : 1,
                    }}
                    className={`${
                      i + hourSplits < array.length
                        ? isSelected
                          ? isDraft
                            ? 'bg-green-500/50'
                            : isSaved
                              ? 'bg-green-500/70'
                              : // : 'animate-pulse bg-green-500/70'
                                'bg-green-500/70'
                          : 'bg-foreground/10'
                        : ''
                    } relative h-3 w-full ${
                      hideBorder
                        ? ''
                        : (i + 1) % hourSplits === 0
                          ? 'border-foreground/50 border-b'
                          : (i + 1) % (hourSplits / 2) === 0
                            ? 'border-foreground/50 border-b border-dashed'
                            : ''
                    }`}
                  />
                </TooltipTrigger>
                {isSelectable && previewDate && (
                  <TooltipContent className="bg-background text-foreground pointer-events-none border">
                    <div className="font-bold">
                      {dayjs(previewDate).format('HH:mm')} -{' '}
                      {dayjs(previewDate).add(15, 'minutes').format('HH:mm')} (
                      {dayjs(previewDate).format('DD/MM/YYYY')})
                    </div>
                    <Separator className="my-1" />
                    <div className={`text-dynamic-green font-semibold`}>
                      {getPreviewUsers(timeblocks).available.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-center gap-1"
                        >
                          <div>{user.display_name}</div>
                          {user.is_guest ? (
                            <ShieldMinus size={16} />
                          ) : (
                            <ShieldCheck size={16} />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className={`text-dynamic-red font-semibold`}>
                      {getPreviewUsers(timeblocks).unavailable.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-center gap-1"
                        >
                          <div>{user.display_name}</div>
                          {user.is_guest ? (
                            <ShieldMinus size={16} />
                          ) : (
                            <ShieldCheck size={16} />
                          )}
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          );
        })}
    </div>
  );
}
