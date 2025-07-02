import { useEffect } from 'react';
import { YearPicker } from './year-picker';

interface Props {
  startYear?: Date;
  setStartYear: (year?: Date) => void;
  endYear?: Date;
  setEndYear: (year?: Date) => void;
  className?: string;
}

export function YearRangePicker({
  startYear,
  setStartYear,
  endYear,
  setEndYear,
  className,
}: Props) {
  useEffect(() => {
    if (startYear && endYear && startYear > endYear) {
      setEndYear(startYear);
    }
  }, [startYear, endYear, setEndYear]);

  return (
    <div className={className}>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Select start year</h2>
        <YearPicker
          defaultValue={startYear}
          onValueChange={setStartYear}
          toDate={endYear}
        />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Select end year</h2>
        <YearPicker
          defaultValue={endYear}
          onValueChange={setEndYear}
          fromDate={startYear}
        />
      </div>
    </div>
  );
}
