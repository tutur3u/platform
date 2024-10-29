import {
  DateRange,
  DateRangeOption,
  DateRangeUnit,
  getDateRange,
  getDateRangeUnits,
} from '@/utils/date-helper';
import { Select } from '@mantine/core';
import 'dayjs/locale/vi';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface Props {
  value?: DateRange;
  onChange?: (value: DateRange) => void;

  defaultUnit?: DateRangeUnit;
  defaultOption?: DateRangeOption;
}

const DateRangePicker = ({
  value: _,
  onChange,
  defaultUnit = 'custom',
  defaultOption = 'present',
}: Props) => {
  const [unit, setUnit] = useState<DateRangeUnit>(defaultUnit);
  const [option] = useState<DateRangeOption>(defaultOption);

  const t = useTranslations('date_helper');
  const timeUnit = t('time-unit');
  const timeUnitPlaceholder = t('time-unit-placeholder');
  // const timeRange = t('time-range');
  // const timeRangePlaceholder = t('time-range-placeholder');

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
      />

      {/* {unit === 'custom' ? (
        <DatePickerInput
          type="range"
          label={timeRange}
          value={value}
          onChange={onChange}
          classNames={{
            input: 'dark:bg-[#25262b]',
          }}
          locale={locale}
          valueFormat="DD MMMM, YYYY"
        />
      ) : (
        <Select
          label={timeRange}
          placeholder={timeRangePlaceholder}
          value={option}
          onChange={(value) => setOption((value || 'today') as DateRangeOption)}
          data={getDateRangeOptions(unit, t)}
        />
      )} */}
    </>
  );
};

export default DateRangePicker;
