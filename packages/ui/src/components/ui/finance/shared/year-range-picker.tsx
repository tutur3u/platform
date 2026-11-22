import { useId } from 'react';
import { Label } from '../../label';
import { YearPicker } from './year-picker';

interface Props {
  startYear?: Date;
  setStartYear: (year?: Date) => void;
  endYear?: Date;
  setEndYear: (year?: Date) => void;
  startLabel: string;
  endLabel: string;
  className?: string;
  pickerLabels: {
    placeholder: string;
    previousDecade: string;
    nextDecade: string;
  };
}

export function YearRangePicker({
  startYear,
  setStartYear,
  endYear,
  setEndYear,
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
      <div className="flex flex-col gap-2">
        <Label htmlFor={startId}>{startLabel}</Label>
        <YearPicker
          id={startId}
          defaultValue={startYear}
          onValueChange={setStartYear}
          toDate={endYear}
          labels={pickerLabels}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={endId}>{endLabel}</Label>
        <YearPicker
          id={endId}
          defaultValue={endYear}
          onValueChange={setEndYear}
          fromDate={startYear}
          labels={pickerLabels}
        />
      </div>
    </div>
  );
}
