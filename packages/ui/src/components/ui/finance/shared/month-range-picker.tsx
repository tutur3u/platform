import { useId } from 'react';
import { Label } from '../../label';
import { MonthPicker } from './month-picker';

interface Props {
  startMonth?: Date;
  setStartMonth: (month?: Date) => void;
  endMonth?: Date;
  setEndMonth: (month?: Date) => void;
  startLabel: string;
  endLabel: string;
  className?: string;
  pickerLabels: {
    placeholder: string;
    previousYear: string;
    nextYear: string;
  };
}

export function MonthRangePicker({
  startMonth,
  setStartMonth,
  endMonth,
  setEndMonth,
  startLabel,
  endLabel,
  className,
  pickerLabels,
}: Props) {
  const id = useId();
  const startId = `${id}-start`;
  const endId = `${id}-end`;

  return (
    <div className={className}>
      <div className="flex flex-col justify-end gap-2">
        <Label htmlFor={startId}>{startLabel}</Label>
        <MonthPicker
          id={startId}
          defaultValue={startMonth}
          onValueChange={setStartMonth}
          toDate={endMonth}
          labels={pickerLabels}
        />
      </div>
      <div className="flex flex-col justify-end gap-2">
        <Label htmlFor={endId}>{endLabel}</Label>
        <MonthPicker
          id={endId}
          defaultValue={endMonth}
          onValueChange={setEndMonth}
          fromDate={startMonth}
          labels={pickerLabels}
        />
      </div>
    </div>
  );
}
