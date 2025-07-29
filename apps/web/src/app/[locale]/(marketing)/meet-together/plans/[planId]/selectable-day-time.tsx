import { useTimeBlocking } from './time-blocking-provider';
import { timetzToTime } from '@/utils/date-helper';
import dayjs from 'dayjs';

type TimeBlockResult = {
  type: 'draft-add' | 'draft-remove' | 'local' | 'server' | 'none';
  tentative?: boolean;
};

export default function SelectableDayTime({
  date,
  start,
  end,
  disabled,
}: {
  date: string;
  start: number;
  end: number;
  disabled: boolean;
}) {
  const { editing, selectedTimeBlocks, edit, setPreviewDate, tentativeMode } =
    useTimeBlocking();

  const hourBlocks = Array.from(Array(Math.floor(end + 1 - start)).keys());
  const hourSplits = 4;

  const isTimeBlockSelected = (i: number): TimeBlockResult => {
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
      return {
        type: editing.mode === 'add' ? 'draft-add' : 'draft-remove',
        tentative: tentativeMode,
      };

    // If the timeblock is pre-selected
    const tb = selectedTimeBlocks.data.find((tb) => {
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

    if (tb) {
      return {
        type: tb.id !== undefined ? 'server' : 'local',
        tentative: tb.tentative,
      };
    }
    return { type: 'none' };
  };

  return (
    <div className="relative w-14 border border-b-0 border-foreground/50">
      {hourBlocks
        .map((i) => (i + start) * hourSplits)
        // duplicate each item `hourSplits` times
        .flatMap((i) => Array(hourSplits).fill(i))
        .map((_, i, array) => {
          const result = isTimeBlockSelected(i);

          const isDraft = result.type.includes('draft');
          const isSaved = result.type.includes('server');
          const isLocal = result.type.includes('local');
          const isTentative = result.tentative ?? false;

          const currentDate = dayjs(date)
            .hour(Math.floor(i / hourSplits) + start)
            .minute((i % hourSplits) * 15)
            .toDate();

          const isSelected = isSaved || isLocal || result.type.includes('add');
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
                      ? isTentative
                        ? 'bg-yellow-500/50'
                        : 'bg-green-500/50'
                      : isSaved
                        ? isTentative
                          ? 'bg-yellow-500/70'
                          : 'bg-green-500/70'
                        : isTentative
                          ? 'bg-yellow-500/70'
                          : 'bg-green-500/70'
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
