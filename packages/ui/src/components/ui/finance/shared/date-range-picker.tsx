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
  return (
    <div className={className}>
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">{startLabel}</h2>
        <DatePicker
          defaultValue={startDate}
          onValueChange={setStartDate}
          toDate={endDate}
        />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">{endLabel}</h2>
        <DatePicker
          defaultValue={endDate}
          onValueChange={setEndDate}
          fromDate={startDate}
        />
      </div>
    </div>
  );
}
