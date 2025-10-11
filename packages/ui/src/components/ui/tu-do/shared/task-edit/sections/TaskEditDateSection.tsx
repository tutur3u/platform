import { Calendar } from '@tuturuuu/icons';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { Label } from '@tuturuuu/ui/label';
import { memo } from 'react';

interface TaskEditDateSectionProps {
  startDate: Date | undefined;
  endDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
}

export const TaskEditDateSection = memo(function TaskEditDateSection({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: TaskEditDateSectionProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="flex items-center gap-2 font-medium text-sm">
          <Calendar className="h-4 w-4" />
          Start Date
        </Label>
        <DateTimePicker
          date={startDate}
          setDate={onStartDateChange}
          showTimeSelect={true}
        />
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2 font-medium text-sm">
          <Calendar className="h-4 w-4" />
          Due Date
        </Label>
        <DateTimePicker
          date={endDate}
          setDate={onEndDateChange}
          showTimeSelect={true}
          minDate={startDate || new Date()}
        />
      </div>

      {startDate && endDate && startDate > endDate && (
        <div className="rounded-md border border-dynamic-yellow/30 bg-dynamic-yellow/10 p-3 text-dynamic-yellow text-sm">
          Warning: Start date is after due date
        </div>
      )}
    </div>
  );
});
