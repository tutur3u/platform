import { BadgeCheck, BadgeQuestionMark, BadgeX } from '@tuturuuu/icons';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { Separator } from '@tuturuuu/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { timetzToTime } from '@tuturuuu/utils/date-helper';
import dayjs from 'dayjs';
import { memo, useEffect, useMemo } from 'react';

function PreviewDayTime({
  timeblocks: serverTimeblocks,
  date,
  start,
  end,
  disabled,
  showBestTimes = false,
  globalMaxAvailable,
  onBestTimesStatus,
}: {
  timeblocks: Timeblock[];
  date: string;
  start: number;
  end: number;
  disabled: boolean;
  showBestTimes?: boolean;
  globalMaxAvailable: number;
  onBestTimesStatus?: (hasBestTimes: boolean) => void;
}) {
  const {
    filteredUserIds,
    previewDate,
    setPreviewDate,
    getPreviewUsers,
    getOpacityForDate,
  } = useTimeBlocking();

  // Memoize expensive calculations
  const { timeblocks, bestBlockIndices, hourBlocks, hourSplits } =
    useMemo(() => {
      const filteredTimeblocks =
        filteredUserIds.length > 0
          ? serverTimeblocks.filter(
              (tb) => tb.user_id && filteredUserIds.includes(tb.user_id)
            )
          : serverTimeblocks;

      const hourBlocks = Array.from(Array(Math.floor(end + 1 - start)).keys());
      const hourSplits = 4;

      // Compute available user count for each slot
      const counts: number[] = hourBlocks
        .map((i) => (i + start) * hourSplits)
        .flatMap((i) => Array(hourSplits).fill(i))
        .map((_, i) => {
          const currentDate = dayjs(date)
            .hour(Math.floor(i / hourSplits) + start)
            .minute((i % hourSplits) * 15)
            .toDate();
          const userIds = filteredTimeblocks
            .filter((tb) => {
              const start = dayjs(`${tb.date} ${tb.start_time}`);
              const end = dayjs(`${tb.date} ${tb.end_time}`);
              return dayjs(currentDate).isBetween(start, end, null, '[)');
            })
            .map((tb) => tb.user_id)
            .filter(Boolean);
          const uniqueUserIds = Array.from(new Set(userIds));
          return uniqueUserIds.length;
        });

      // Find all blocks with the global max available
      const bestIndices: Set<number> = new Set();
      if (showBestTimes && globalMaxAvailable >= 2) {
        counts.forEach((count, i) => {
          if (count === globalMaxAvailable) {
            bestIndices.add(i);
          }
        });
      }

      return {
        timeblocks: filteredTimeblocks,
        slotAvailableCounts: counts,
        bestBlockIndices: bestIndices,
        hourBlocks,
        hourSplits,
      };
    }, [
      serverTimeblocks,
      filteredUserIds,
      date,
      start,
      end,
      showBestTimes,
      globalMaxAvailable,
    ]);

  // Memoize preview users to prevent infinite re-renders
  const previewUsers = useMemo(() => {
    if (!previewDate) return { available: [], tentative: [], unavailable: [] };
    return getPreviewUsers(timeblocks);
  }, [previewDate, getPreviewUsers, timeblocks]);

  // Notify parent about best times status
  useEffect(() => {
    if (onBestTimesStatus) {
      onBestTimesStatus(bestBlockIndices.size > 0);
    }
  }, [bestBlockIndices.size, onBestTimesStatus]);

  const isTimeBlockSelected = (
    i: number
  ): {
    type: 'local' | 'server' | 'none';
    tentative?: boolean;
  } => {
    // If the timeblock is pre-selected
    const tb = timeblocks.find((tb) => {
      if (tb.date !== date) return false;

      const startTime = timetzToTime(tb.start_time);
      const endTime = timetzToTime(tb.end_time);

      const [startHourStr, startMinuteStr] = startTime.split(':');
      const startHour = Number(startHourStr) - start;
      const startMinute = Number(startMinuteStr);

      const [endHourStr, endMinuteStr] = endTime.split(':');
      const endHour = Number(endHourStr) - start;
      const endMinute = Number(endMinuteStr);

      const startBlock = Math.floor(
        (startHour ?? 0) * hourSplits + (startMinute ?? 0) / 15
      );
      // End is exclusive; when endMinute is 0, step back one slot
      const endBlock = Math.floor(
        (endHour ?? 0) * hourSplits +
          ((endMinute ?? 0) === 0 ? -1 : Math.max(0, (endMinute ?? 0) - 1)) / 15
      );
      return i >= startBlock && i <= endBlock;
    });

    if (tb) {
      return {
        type: tb.id !== undefined ? 'server' : 'local',
        tentative: tb.tentative,
      };
    }
    return { type: 'none' };
  };

  return (
    <div className="relative w-full border border-foreground/20 border-b-0">
      {hourBlocks
        .map((i) => (i + start) * hourSplits)
        // duplicate each item `hourSplits` times
        .flatMap((i) => Array(hourSplits).fill(i))
        .map((_, i, array) => {
          const result = isTimeBlockSelected(i);

          // const isDraft = result.type.includes('draft');
          const isSaved = result.type.includes('server');
          const isLocal = result.type.includes('local');
          const isTentative = result.tentative ?? false;

          const currentDate = dayjs(date)
            .hour(Math.floor(i / hourSplits) + start)
            .minute((i % hourSplits) * 15)
            .toDate();

          const isSelected = isSaved || isLocal || result.type.includes('add');
          const isSelectable = i + hourSplits < array.length;
          const hideBorder = i === 0 || i + hourSplits > array.length - 1;
          const opacity = getOpacityForDate(currentDate, timeblocks);

          // If showBestTimes is enabled, only highlight slots in the longest contiguous block(s) with max availability
          let cellClass = '';
          let cellStyle = {};
          if (i + hourSplits < array.length) {
            if (showBestTimes) {
              if (bestBlockIndices.has(i)) {
                cellClass = 'bg-green-500/70';
                cellStyle = { opacity: 1 };
              } else {
                cellClass = 'bg-foreground/10';
                cellStyle = { opacity: 1 };
              }
            } else {
              if (isSelected) {
                const color =
                  filteredUserIds.length > 0 && isTentative
                    ? 'yellow'
                    : 'green';
                cellClass = `bg-${color}-500/70`;
              } else {
                cellClass = 'bg-foreground/10';
              }
              cellStyle = {
                opacity: isSelected
                  ? opacity === 'infinity'
                    ? 1
                    : opacity
                  : 1,
              };
            }
          }

          const editData = {
            mode: isSelected ? 'remove' : 'add',
            date: currentDate,
          } as const;

          return (
            <TooltipProvider key={`${date}-${i}`} delayDuration={0}>
              <Tooltip disableHoverableContent>
                <TooltipTrigger asChild>
                  {/* biome-ignore lint/a11y/useKeyWithMouseEvents: hover preview is intentional UX for tooltip - keyboard users can use tab navigation */}
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
                    style={cellStyle}
                    className={`${cellClass} relative h-3 w-full ${
                      hideBorder
                        ? ''
                        : (i + 1) % hourSplits === 0
                          ? 'border-foreground/20 border-b'
                          : (i + 1) % (hourSplits / 2) === 0
                            ? 'border-foreground/20 border-b border-dashed'
                            : ''
                    }`}
                  />
                </TooltipTrigger>
                {isSelectable && previewDate && (
                  <TooltipContent className="pointer-events-none border bg-background text-foreground">
                    <div className="font-bold">
                      {dayjs(previewDate).format('HH:mm')} -{' '}
                      {dayjs(previewDate).add(15, 'minutes').format('HH:mm')} (
                      {dayjs(previewDate).format('DD/MM/YYYY')})
                    </div>
                    <Separator className="my-1" />
                    <div className={`font-semibold text-dynamic-green`}>
                      {previewUsers.available.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-center gap-1"
                        >
                          <div>{user.display_name}</div>
                          <BadgeCheck size={16} />
                        </div>
                      ))}
                    </div>
                    <div className={`font-semibold text-dynamic-yellow`}>
                      {previewUsers.tentative.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-center gap-1"
                        >
                          <div>{user.display_name}</div>
                          <BadgeQuestionMark size={16} />
                        </div>
                      ))}
                    </div>
                    <div className={`font-semibold text-dynamic-red`}>
                      {previewUsers.unavailable.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-center gap-1"
                        >
                          <div>{user.display_name}</div>
                          <BadgeX size={16} />
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

export default memo(PreviewDayTime);
