import { Button } from '@tutur3u/ui/button';
import { Calendar } from '@tutur3u/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@tutur3u/ui/popover';
import { cn } from '@tutur3u/utils/format';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useState } from 'react';

interface Props {
  defaultValue?: Date;
  // eslint-disable-next-line no-unused-vars
  onValueChange: (date?: Date) => void;
  fromDate?: Date;
  toDate?: Date;
  className?: string;
}

export function DatePicker({
  defaultValue,
  onValueChange,
  className,
  fromDate,
  toDate,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn(
            'w-full justify-start text-left font-normal md:w-[280px]',
            !defaultValue && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {defaultValue ? (
            format(defaultValue, 'PPP')
          ) : (
            <span>Pick a date</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={defaultValue}
          onSelect={(date) => {
            onValueChange(date);
          }}
          onSubmit={(date) => {
            onValueChange(date);
          }}
          fromDate={fromDate}
          toDate={toDate}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
