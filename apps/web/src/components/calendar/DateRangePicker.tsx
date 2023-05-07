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
  getDateRangeUnits,
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

  const { t } = useTranslation('date-helper');
  const timeUnit = t('time-unit');
  const timeUnitPlaceholder = t('time-unit-placeholder');
  const timeRange = t('time-range');
  const timeRangePlaceholder = t('time-range-placeholder');

  const dateRangeUnits = getDateRangeUnits(t);

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
        label={timeUnit}
        placeholder={timeUnitPlaceholder}
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
          label={timeRange}
          placeholder={timeRangePlaceholder}
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
          label={timeRange}
          placeholder={timeRangePlaceholder}
          value={option}
          onChange={(value) => setOption((value || 'today') as DateRangeOption)}
          data={getDateRangeOptions(unit, t)}
          icon={<CalendarDaysIcon className="h-5" />}
        />
      )}
    </>
  );
};

export default DateRangePicker;
