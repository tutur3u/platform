import { MonthPicker } from './month-picker';
import { useEffect } from 'react';

interface Props {
  startMonth?: Date;
  setStartMonth: (month?: Date) => void;
  endMonth?: Date;
  setEndMonth: (month?: Date) => void;
  className?: string;
}

export function MonthRangePicker({
  startMonth,
  setStartMonth,
  endMonth,
  setEndMonth,
  className,
}: Props) {
  useEffect(() => {
    if (startMonth && endMonth && startMonth > endMonth) {
      setEndMonth(startMonth);
    }
  }, [startMonth, endMonth]);

  return (
    <div className={className}>
      <div className="flex flex-col justify-end gap-2">
        <h2 className="text-lg font-semibold">Select start month</h2>
        <MonthPicker
          defaultValue={startMonth}
          onValueChange={setStartMonth}
          toDate={endMonth}
        />
      </div>
      <div className="flex flex-col justify-end gap-2">
        <h2 className="text-lg font-semibold">Select end month</h2>
        <MonthPicker
          defaultValue={endMonth}
          onValueChange={setEndMonth}
          fromDate={startMonth}
        />
      </div>
    </div>
  );
}
