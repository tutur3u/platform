import { Timeblock } from '@/types/primitives/Timeblock';
import { useTimeBlocking } from './time-blocking-provider';
import { timetzToTime } from '@/utils/date-helper';
import dayjs from 'dayjs';

export default function DayTime({
  timeblocks,
  date,
  start,
  end,
  editable,
}: {
  timeblocks: Timeblock[];
  date: string;
  start: number;
  end: number;
  editable: boolean;
  disabled: boolean;
}) {
  const { editing, selectedTimeBlocks, edit } = useTimeBlocking();

  const hourBlocks = Array.from(Array(Math.floor(end + 1 - start)).keys());
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
    const tb = (editable ? selectedTimeBlocks : timeblocks).find((tb) => {
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
        Math.floor(startHour * hourSplits + startMinute / 15) + 1;
      const endBlock = Math.floor(endHour * hourSplits + endMinute / 15);

      return i >= startBlock && i <= endBlock;
    });

    if (tb) return tb.id !== undefined ? 'server' : 'local';
    return 'none';
  };

  return (
    <div className="border-foreground/50 relative w-12 border border-b-0">
      {hourBlocks
        .map((i) => (i + start) * hourSplits)
        // duplicate each item `hourSplits` times
        .flatMap((i) => Array(hourSplits).fill(i))
        .map((_, i, array) => {
          const result = isTimeBlockSelected(i);

          const isDraft = result.includes('draft');
          const isSaved = result.includes('server');
          const isLocal = result.includes('local');

          const isSelected = isSaved || isLocal || result.includes('add');
          const hideBorder = i === 0 || i + hourSplits > array.length - 1;

          const editData = {
            mode: isSelected ? 'remove' : 'add',
            date: dayjs(date)
              .hour(Math.floor(i / hourSplits) + start)
              .minute((i % hourSplits) * 15)
              .toDate(),
          } as const;

          return (
            <div
              key={`${date}-${i}`}
              onMouseDown={
                editable
                  ? (e) => {
                      e.preventDefault();
                      edit(editData);
                    }
                  : undefined
              }
              onMouseOver={
                editable
                  ? (e) => {
                      e.preventDefault();
                      if (!editing.enabled) return;
                      edit(editData);
                    }
                  : undefined
              }
              onTouchStart={
                editable
                  ? (e) => {
                      if (editing.enabled) return;
                      edit(editData, e);
                    }
                  : undefined
              }
              onTouchMove={
                editable
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
                        : 'animate-pulse bg-green-500/70'
                    : editable
                      ? isDraft
                        ? 'bg-red-500/50'
                        : 'bg-red-500/20'
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
          );
        })}
    </div>
  );
}
