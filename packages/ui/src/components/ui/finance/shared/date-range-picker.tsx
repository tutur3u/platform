import { useId } from 'react';
import { Label } from '../../label';
import { DatePicker } from './date-picker';

interface Props {
  startDate?: Date;
  setStartDate: (date?: Date) => void;
  endDate?: Date;
  setEndDate: (date?: Date) => void;
  startLabel: string;
  endLabel: string;
  className?: string;
}

export function DateRangePicker({
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  startLabel,
  endLabel,
  className,
}: Props) {
  const id = useId();
  const startId = `${id}-start`;
  const endId = `${id}-end`;

  return (
    <div className={className}>
      <div className="flex flex-col gap-2">
        <Label htmlFor={startId}>{startLabel}</Label>
        <DatePicker
          id={startId}
          defaultValue={startDate}
          onValueChange={setStartDate}
          toDate={endDate}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={endId}>{endLabel}</Label>
        <DatePicker
          id={endId}
          defaultValue={endDate}
          onValueChange={setEndDate}
          fromDate={startDate}
        />
      </div>
    </div>
  );
}
