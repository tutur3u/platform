import { useTimeBlocking } from './time-blocking-provider';
import { timetzToTime } from '@/utils/date-helper';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import dayjs from 'dayjs';

export default function SelectableDayTime({
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
  const { editing, selectedTimeBlocks, edit, setPreviewDate } =
    useTimeBlocking();

  // Handle time ranges that cross midnight
  let hourBlocks: number[];
  if (end >= start) {
    // Normal case: same day
    hourBlocks = Array.from(Array(Math.floor(end + 1 - start)).keys());
  } else {
    // Crosses midnight: split into two parts
    // Part 1: from start to 23 (end of day)
    const part1 = Array.from(Array(24 - start)).keys();
    // Part 2: from 0 to end (beginning of next day)
    const part2 = Array.from(Array(end + 1)).keys();
    hourBlocks = [...part1, ...part2];
  }

  const hourSplits = 4;

  const isTimeBlockSelected = (
    i: number
  ): 'draft-add' | 'draft-remove' | 'local' | 'server' | 'none' => {
    const editingStartDate =
      editing.startDate && editing.endDate
        ? dayjs(editing.startDate).isAfter(editing.endDate)
          ? editing.endDate
          : editing.startDate
        : editing.startDate;

    const editingEndDate =
      editing.startDate && editing.endDate
        ? dayjs(editing.startDate).isAfter(editing.endDate)
          ? editing.startDate
          : editing.endDate
        : editing.endDate;

    // If editing is enabled and the date is between the start and end date
    if (
      editing.enabled &&
      editingStartDate &&
      editingEndDate &&
      (dayjs(date).isSame(editingStartDate, 'day') ||
        dayjs(date).isSame(editingEndDate, 'day') ||
        dayjs(date).isBetween(editingStartDate, editingEndDate)) &&
      ((i >=
        Math.floor(
          (editingStartDate.getHours() - start) * hourSplits +
            editingStartDate.getMinutes() / 15
        ) &&
        i <=
          Math.floor(
            (editingEndDate.getHours() - start) * hourSplits +
              editingEndDate.getMinutes() / 15
          )) ||
        (i >=
          Math.floor(
            (editingEndDate.getHours() - start) * hourSplits +
              editingEndDate.getMinutes() / 15
          ) &&
          i <=
            Math.floor(
              (editingStartDate.getHours() - start) * hourSplits +
                editingStartDate.getMinutes() / 15
            )))
    )
      return editing.mode === 'add' ? 'draft-add' : 'draft-remove';

    // If the timeblock is pre-selected
    const tb = selectedTimeBlocks.data.find((tb) => {
      if (tb.date !== date) return false;

      const startTime = timetzToTime(tb.start_time);
      const endTime = timetzToTime(tb.end_time);

      // Check if times are valid
      if (!startTime || !endTime) return false;

      // Convert timeblock times to local hours and minutes
      const startParts = startTime.split(':').map((v) => Number(v));
      const endParts = endTime.split(':').map((v) => Number(v));
      
      if (startParts.length < 2 || endParts.length < 2) return false;
      
      const [startHour, startMinute] = startParts;
      const [endHour, endMinute] = endParts;

      // Additional type guards for destructured values
      if (typeof startHour !== 'number' || typeof startMinute !== 'number' || 
          typeof endHour !== 'number' || typeof endMinute !== 'number') {
        return false;
      }

      // Calculate the current slot's hour
      let slotHour = Math.floor(i / hourSplits) + start;
      if (slotHour >= 24) {
        slotHour = slotHour - 24;
      }

      // Check if the current slot is within the timeblock range
      const currentSlotTime = slotHour * 60 + (i % hourSplits) * 15;
      const timeblockStartTime = startHour * 60 + startMinute;
      const timeblockEndTime = endHour * 60 + endMinute;

      return (
        currentSlotTime >= timeblockStartTime &&
        currentSlotTime < timeblockEndTime
      );
    });

    if (tb) return tb.id !== undefined ? 'server' : 'local';
    return 'none';
  };

  return (
    <div className="relative w-14 border border-b-0 border-foreground/50">
      {hourBlocks
        .map((i) => {
          // Adjust hour calculation for midnight crossing
          let adjustedHour = i + start;
          if (adjustedHour >= 24) {
            adjustedHour = adjustedHour - 24;
          }
          return adjustedHour * hourSplits;
        })
        // duplicate each item `hourSplits` times
        .flatMap((i) => Array(hourSplits).fill(i))
        .map((_, i, array) => {
          // Calculate the actual hour for this slot
          let actualHour = Math.floor(i / hourSplits) + start;
          if (actualHour >= 24) {
            actualHour = actualHour - 24;
          }

          const currentDate = dayjs(date)
            .hour(actualHour)
            .minute((i % hourSplits) * 15)
            .toDate();

          // Only render if currentDate matches the column's date
          if (dayjs(currentDate).format('YYYY-MM-DD') !== date) return null;

          const result = isTimeBlockSelected(i);

          const isDraft = result.includes('draft');
          const isSaved = result.includes('server');
          const isLocal = result.includes('local');

          const isSelected = isSaved || isLocal || result.includes('add');
          const isSelectable = i + hourSplits < array.length && !disabled;
          const hideBorder = i === 0 || i + hourSplits > array.length - 1;

          const editData = {
            mode: isSelected ? 'remove' : 'add',
            date: currentDate,
          } as const;

          return (
            <div
              key={`${date}-${i}`}
              onMouseDown={
                disabled
                  ? undefined
                  : isSelectable
                    ? (e) => {
                        e.preventDefault();
                        edit(editData);
                      }
                    : undefined
              }
              onMouseOver={
                disabled
                  ? undefined
                  : isSelectable
                    ? (e) => {
                        e.preventDefault();
                        if (!editing.enabled) return;
                        edit(editData);
                      }
                    : (e) => {
                        e.preventDefault();
                        setPreviewDate(editData.date);
                      }
              }
              onTouchStart={
                disabled
                  ? undefined
                  : isSelectable
                    ? (e) => {
                        if (editing.enabled) return;
                        edit(editData, e);
                      }
                    : (e) => {
                        e.preventDefault();
                        setPreviewDate(editData.date);
                      }
              }
              onTouchMove={
                disabled
                  ? undefined
                  : isSelectable
                    ? (e) => {
                        if (!editing.enabled) return;
                        edit(editData, e);
                      }
                    : undefined
              }
              className={`${
                i + hourSplits < array.length
                  ? isSelected
                    ? isDraft
                      ? 'bg-green-500/50'
                      : isSaved
                        ? 'bg-green-500/70'
                        : // : 'animate-pulse bg-green-500/70'
                          'bg-green-500/70'
                    : isDraft
                      ? 'bg-red-500/50'
                      : 'bg-red-500/20'
                  : ''
              } relative h-3 w-full ${
                hideBorder
                  ? ''
                  : (i + 1) % hourSplits === 0
                    ? 'border-b border-foreground/50'
                    : (i + 1) % (hourSplits / 2) === 0
                      ? 'border-b border-dashed border-foreground/50'
                      : ''
              }`}
            />
          );
        })}
    </div>
  );
}
