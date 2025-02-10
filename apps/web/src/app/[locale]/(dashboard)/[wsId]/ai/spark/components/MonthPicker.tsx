import { Button } from '@tutur3u/ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tutur3u/ui/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface MonthPickerProps {
  value: Date;
  // eslint-disable-next-line no-unused-vars
  onChange: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
}

export function MonthPicker({
  value,
  onChange,
  minDate = new Date(new Date().getFullYear(), 0),
  maxDate = new Date(new Date().getFullYear() + 2, 11),
}: MonthPickerProps) {
  const [year, setYear] = useState(value.getFullYear());

  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const years = Array.from(
    { length: maxDate.getFullYear() - minDate.getFullYear() + 1 },
    (_, i) => minDate.getFullYear() + i
  );

  const handlePrevYear = () => {
    if (year > minDate.getFullYear()) {
      setYear(year - 1);
    }
  };

  const handleNextYear = () => {
    if (year < maxDate.getFullYear()) {
      setYear(year + 1);
    }
  };

  const handleMonthSelect = (monthIndex: number) => {
    const newDate = new Date(year, monthIndex);
    if (newDate >= minDate && newDate <= maxDate) {
      onChange(newDate);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handlePrevYear}
          disabled={year <= minDate.getFullYear()}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Select
          value={year.toString()}
          onValueChange={(value) => setYear(parseInt(value))}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Select year" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={y.toString()}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleNextYear}
          disabled={year >= maxDate.getFullYear()}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {months.map((month, index) => {
          const monthDate = new Date(year, index);
          const isDisabled = monthDate < minDate || monthDate > maxDate;
          const isSelected =
            value.getMonth() === index && value.getFullYear() === year;

          return (
            <Button
              type="button"
              key={month}
              variant={isSelected ? 'default' : 'outline'}
              className="h-auto py-4"
              disabled={isDisabled}
              onClick={() => handleMonthSelect(index)}
            >
              <span className="text-sm">{month.slice(0, 3)}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
