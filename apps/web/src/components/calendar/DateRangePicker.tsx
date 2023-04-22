import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import { Select } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import useTranslation from 'next-translate/useTranslation';
import { useEffect, useState } from 'react';
import 'dayjs/locale/vi';
import {
  DateRange,
  DateRangeOption,
  DateRangeUnit,
  dateRangeUnits,
  getDateRange,
  getDateRangeOptions,
} from '../../utils/date-helper';

interface Props {
  value?: DateRange;
  onChange?: (value: DateRange) => void;

  defaultUnit?: DateRangeUnit;
  defaultOption?: DateRangeOption;
}

const DateRangePicker = ({
  value,
  onChange,
  defaultUnit = 'custom',
  defaultOption = 'present',
}: Props) => {
  const { lang } = useTranslation();

  const [unit, setUnit] = useState<DateRangeUnit>(defaultUnit);
  const [option, setOption] = useState<DateRangeOption>(defaultOption);

  useEffect(() => {
    if (unit === 'custom') {
      onChange?.([null, null]);
      return;
    }

    const newDateRange = getDateRange(unit, option);
    onChange?.(newDateRange);
  }, [unit, option, onChange]);

  return (
    <>
      <Select
        label="Đơn vị thời gian"
        placeholder="Chọn đơn vị thời gian"
        value={unit}
        onChange={(value) => {
          setUnit((value || 'day') as DateRangeUnit);
        }}
        data={dateRangeUnits}
        icon={<CalendarDaysIcon className="h-5" />}
      />

      {unit === 'custom' ? (
        <DatePickerInput
          type="range"
          label="Khoảng thời gian"
          placeholder="Chọn khoảng thời gian"
          value={value}
          onChange={onChange}
          classNames={{
            input: 'bg-[#25262b]',
          }}
          locale={lang}
          valueFormat="DD MMMM, YYYY"
        />
      ) : (
        <Select
          label="Khoảng thời gian"
          placeholder="Chọn khoảng thời gian"
          value={option}
          onChange={(value) => setOption((value || 'today') as DateRangeOption)}
          data={getDateRangeOptions(unit)}
          icon={<CalendarDaysIcon className="h-5" />}
        />
      )}
    </>
  );
};

export default DateRangePicker;
