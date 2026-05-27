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
  return (
    <div className={className}>
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">{startLabel}</h2>
        <YearPicker
          defaultValue={startYear}
          onValueChange={setStartYear}
          toDate={endYear}
          labels={pickerLabels}
        />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">{endLabel}</h2>
        <YearPicker
          defaultValue={endYear}
          onValueChange={setEndYear}
          fromDate={startYear}
          labels={pickerLabels}
        />
      </div>
    </div>
  );
}
