import { CalendarDaysIcon } from '@heroicons/react/24/solid';
import { DatePickerInput } from '@mantine/dates';
import useTranslation from 'next-translate/useTranslation';
import { useEffect, useState } from 'react';
interface Props {}

const FilterDateIcon = () => {
  return <CalendarDaysIcon className="h-5" />;
};

const FilterDateSelector = (props: Props) => {
  const [value, setValue] = useState<[Date | null, Date | null]>([
    new Date(), null]);

  return (
    <DatePickerInput
      icon={<FilterDateIcon />}
      type='range'
      clearable
      value={value}
      onChange={setValue}
      label="Date Range"
      placeholder="Pick date"
    />
  );
};

export default FilterDateSelector;
