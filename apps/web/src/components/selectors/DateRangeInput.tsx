import { CalendarDaysIcon } from '@heroicons/react/24/solid';
import { DatePickerInput } from '@mantine/dates';
import { useEffect, useState } from 'react';

interface DateFilterProps {
  setStartDate: (date: Date | null) => void;
  setEndDate: (date: Date | null) => void;
}

const DateRangeInput = ({ setStartDate, setEndDate }: DateFilterProps) => {
  const [value, setValue] = useState<[Date | null, Date | null]>([null, null]);

  const startDate = value[0];
  const endDate = value[1];

  useEffect(() => {
    setStartDate(startDate);
  }, [startDate, setStartDate]);

  useEffect(() => {
    // If endDate is not null, add 86399999 milliseconds to it to make it the end of the day
    setEndDate(endDate ? new Date(endDate.getTime() + 86399999) : null);
  }, [endDate, setEndDate]);

  return (
    <DatePickerInput
      type="range"
      clearable
      value={value}
      onChange={setValue}
      label="Date Range"
      placeholder="Pick date"
      icon={<CalendarDaysIcon className="h-5" />}
      classNames={{
        input: 'bg-[#25262b]',
      }}
      allowSingleDateInRange
    />
  );
};

export default DateRangeInput;
