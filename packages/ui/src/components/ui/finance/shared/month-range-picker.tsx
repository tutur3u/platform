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
  return (
    <div className={className}>
      <div className="flex flex-col justify-end gap-2">
        <h2 className="font-semibold text-lg">{startLabel}</h2>
        <MonthPicker
          defaultValue={startMonth}
          onValueChange={setStartMonth}
          toDate={endMonth}
          labels={pickerLabels}
        />
      </div>
      <div className="flex flex-col justify-end gap-2">
        <h2 className="font-semibold text-lg">{endLabel}</h2>
        <MonthPicker
          defaultValue={endMonth}
          onValueChange={setEndMonth}
          fromDate={startMonth}
          labels={pickerLabels}
        />
      </div>
    </div>
  );
}
