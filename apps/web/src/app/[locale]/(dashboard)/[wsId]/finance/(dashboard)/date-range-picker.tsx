import { useEffect } from 'react';
import { DatePicker } from './date-picker';

interface Props {
  startDate?: Date;
  // eslint-disable-next-line no-unused-vars
  setStartDate: (date?: Date) => void;
  endDate?: Date;
  // eslint-disable-next-line no-unused-vars
  setEndDate: (date?: Date) => void;
  className?: string;
}

export function DateRangePicker({
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  className,
}: Props) {
  useEffect(() => {
    if (startDate && endDate && startDate > endDate) {
      setEndDate(startDate);
    }
  }, [startDate, endDate, setEndDate]);

  return (
    <div className={className}>
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">Select start date</h2>
        <DatePicker
          defaultValue={startDate}
          onValueChange={setStartDate}
          toDate={endDate}
        />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">Select end date</h2>
        <DatePicker
          defaultValue={endDate}
          onValueChange={setEndDate}
          fromDate={startDate}
        />
      </div>
    </div>
  );
}
