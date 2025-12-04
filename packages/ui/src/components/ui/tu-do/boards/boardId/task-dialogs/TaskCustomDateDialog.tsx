import { X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';

interface TaskCustomDateDialogProps {
  open: boolean;
  endDate: string | null;
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onDateChange: (date: Date | undefined) => void;
  onClear: () => void;
}

export function TaskCustomDateDialog({
  open,
  endDate,
  isLoading,
  onOpenChange,
  onDateChange,
  onClear,
}: TaskCustomDateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Set Custom Due Date</DialogTitle>
          <DialogDescription>
            Choose a specific date and time for when this task should be
            completed.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <DateTimePicker
            date={endDate ? new Date(endDate) : undefined}
            setDate={onDateChange}
            showTimeSelect={true}
            minDate={new Date()}
            inline
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          {endDate && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onClear();
                onOpenChange(false);
              }}
              disabled={isLoading}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
              Remove Due Date
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
