import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { timetzToTime } from '@tuturuuu/utils/date-helper';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';

export default function SelectableDayTime({
  date,
  start,
  end,
  disabled,
  tentativeMode = false,
}: {
  date: string;
  start: number;
  end: number;
  disabled: boolean;
  tentativeMode?: boolean;
}) {
  const { editing, selectedTimeBlocks, edit, setPreviewDate, endEditing } =
    useTimeBlocking();

  const hourBlocks = Array.from(Array(Math.floor(end + 1 - start)).keys());
  const hourSplits = 4;

  const isTimeBlockSelected = (
    i: number
  ): {
    type: 'draft-add' | 'draft-remove' | 'local' | 'server' | 'none';
    tentative?: boolean;
  } => {
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

      const [startHourStr, startMinuteStr] = startTime.split(':');
      const startHour = Number(startHourStr) - start;
      const startMinute = Number(startMinuteStr);

      const [endHourStr, endMinuteStr] = endTime.split(':');
      const endHour = Number(endHourStr) - start;
      const endMinute = Number(endMinuteStr);

      const startBlock = Math.floor(
        (startHour ?? 0) * hourSplits + (startMinute ?? 0) / 15
      );
      // For end block, subtract 1 minute to make it exclusive
      // This ensures a 12:00-12:15 slot only highlights the 12:00 slot
      // Special handling for hour boundaries: when endMinute is 0, we need to go back to the previous slot
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
          const sameMode = result.tentative === tentativeMode;
          const hideBorder = i === 0 || i + hourSplits > array.length - 1;

          const editData = {
            mode: editing.enabled
              ? editing.mode || 'add'
              : isSelected && sameMode
                ? 'remove'
                : 'add',
            date: currentDate,
            tentativeMode: editing.enabled
              ? editing.tentativeMode
              : isSelected && sameMode
                ? undefined
                : tentativeMode,
          } as const;

          return (
            // biome-ignore lint/a11y/useKeyWithMouseEvents: mouse drag selection is intentional UX for time blocking
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
                        e.preventDefault();
                        edit(editData, e.nativeEvent);
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
                        e.preventDefault();
                        edit(editData, e.nativeEvent);
                      }
                    : undefined
              }
              onTouchEnd={
                disabled
                  ? undefined
                  : (e) => {
                      e.preventDefault();
                      if (editing.enabled) {
                        endEditing();
                      }
                    }
              }
              className={`${
                i + hourSplits < array.length
                  ? isSelected
                    ? isDraft
                      ? isTentative
                        ? 'bg-yellow-500/50'
                        : 'bg-green-500/50'
                      : isTentative
                        ? 'bg-yellow-500/70'
                        : 'bg-green-500/70'
                    : isDraft
                      ? 'bg-dynamic-red/50'
                      : 'bg-dynamic-red/20'
                  : ''
              } relative h-3 w-full ${cn(
                hideBorder
                  ? ''
                  : (i + 1) % hourSplits === 0
                    ? 'border-foreground/50 border-b'
                    : (i + 1) % (hourSplits / 2) === 0
                      ? 'border-foreground/50 border-b border-dashed'
                      : '',
                i === 0 && 'rounded-t-[0.2rem]'
              )}`}
            />
          );
        })}
    </div>
  );
}
