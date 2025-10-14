import { Button } from '@tuturuuu/ui/button';
import { Calendar as CalendarComponent } from '@tuturuuu/ui/calendar';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';

interface CustomDatePickerDialogProps {
  selectedDate: Date | undefined;
  includeTime: boolean;
  selectedHour: string;
  selectedMinute: string;
  selectedPeriod: 'AM' | 'PM';
  onDateSelect: (date: Date | undefined) => void;
  onIncludeTimeChange: (checked: boolean) => void;
  onHourChange: (hour: string) => void;
  onMinuteChange: (minute: string) => void;
  onPeriodChange: (period: 'AM' | 'PM') => void;
  onCancel: () => void;
  onInsert: () => void;
}

export function CustomDatePickerDialog({
  selectedDate,
  includeTime,
  selectedHour,
  selectedMinute,
  selectedPeriod,
  onDateSelect,
  onIncludeTimeChange,
  onHourChange,
  onMinuteChange,
  onPeriodChange,
  onCancel,
  onInsert,
}: CustomDatePickerDialogProps) {
  return (
    <div
      className="pointer-events-auto w-80 rounded-lg border border-border bg-popover p-4 shadow-lg"
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
    >
      <div className="mb-2 font-medium text-foreground text-sm">
        Select custom date
      </div>
      <CalendarComponent
        mode="single"
        selected={selectedDate}
        onSelect={onDateSelect}
        className="rounded-md border p-0"
      />
      <div className="mt-3 flex items-center gap-2 rounded-md border p-2">
        <Switch checked={includeTime} onCheckedChange={onIncludeTimeChange} />
        <Label htmlFor="include-time" className="cursor-pointer text-sm">
          Include time
        </Label>
      </div>
      {includeTime && (
        <div className="mt-2 flex items-center gap-2">
          <Label className="text-sm">Time:</Label>
          <Select value={selectedHour} onValueChange={onHourChange}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => {
                const hour = i + 1;
                return (
                  <SelectItem key={hour} value={hour.toString()}>
                    {hour}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <span>:</span>
          <Select value={selectedMinute} onValueChange={onMinuteChange}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['00', '15', '30', '45', '59'].map((min) => (
                <SelectItem key={min} value={min}>
                  {min}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-md border">
            <Button
              type="button"
              size="sm"
              variant={selectedPeriod === 'AM' ? 'default' : 'ghost'}
              className="h-8 rounded-r-none px-3"
              onClick={(e) => {
                e.stopPropagation();
                onPeriodChange('AM');
              }}
            >
              AM
            </Button>
            <Button
              type="button"
              size="sm"
              variant={selectedPeriod === 'PM' ? 'default' : 'ghost'}
              className="h-8 rounded-l-none px-3"
              onClick={(e) => {
                e.stopPropagation();
                onPeriodChange('PM');
              }}
            >
              PM
            </Button>
          </div>
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onInsert();
          }}
          disabled={!selectedDate}
        >
          Insert
        </Button>
      </div>
    </div>
  );
}
