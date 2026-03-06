import { MonthPicker } from './month-picker';

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
  return (
    <div className={className}>
      <div className="flex flex-col justify-end gap-2">
        <h2 className="font-semibold text-lg">Select start month</h2>
        <MonthPicker
          defaultValue={startMonth}
          onValueChange={setStartMonth}
          toDate={endMonth}
        />
      </div>
      <div className="flex flex-col justify-end gap-2">
        <h2 className="font-semibold text-lg">Select end month</h2>
        <MonthPicker
          defaultValue={endMonth}
          onValueChange={setEndMonth}
          fromDate={startMonth}
        />
      </div>
    </div>
  );
}
