import moment from 'moment';
import { Translate } from 'next-translate';

export type DateRangeOption = 'present' | 'past' | 'future';
export type DateRangeUnit =
  | 'day'
  | 'week'
  | 'month'
  | 'year'
  | 'all'
  | 'custom';

export type DateRange = [Date | null, Date | null];

export const getDateRange = (
  unit: DateRangeUnit,
  option: DateRangeOption
): DateRange => {
  const start = moment();
  const end = moment();

  switch (unit) {
    case 'day':
      switch (option) {
        case 'present':
          start.startOf('day');
          end.endOf('day');
          break;

        case 'past':
          start.subtract(1, 'day').startOf('day');
          end.subtract(1, 'day').endOf('day');
          break;

        case 'future':
          start.add(1, 'day').startOf('day');
          end.add(1, 'day').endOf('day');
          break;
      }
      break;

    case 'week':
      switch (option) {
        case 'present':
          start.startOf('week');
          end.endOf('week');
          break;

        case 'past':
          start.subtract(1, 'week').startOf('week');
          end.subtract(1, 'week').endOf('week');
          break;

        case 'future':
          start.add(1, 'week').startOf('week');
          end.add(1, 'week').endOf('week');
          break;
      }
      break;

    case 'month':
      switch (option) {
        case 'present':
          start.startOf('month');
          end.endOf('month');
          break;

        case 'past':
          start.subtract(1, 'month').startOf('month');
          end.subtract(1, 'month').endOf('month');
          break;

        case 'future':
          start.add(1, 'month').startOf('month');
          end.add(1, 'month').endOf('month');
          break;
      }
      break;

    case 'year':
      switch (option) {
        case 'present':
          start.startOf('year');
          end.endOf('year');
          break;

        case 'past':
          start.subtract(1, 'year').startOf('year');
          end.subtract(1, 'year').endOf('year');
          break;

        case 'future':
          start.add(1, 'year').startOf('year');
          end.add(1, 'year').endOf('year');
          break;
      }
      break;

    case 'all':
      return [null, null];
  }

  return [start.toDate(), end.toDate()];
};

export const getDateRangeUnits = (
  t: Translate
): {
  label: string;
  value: DateRangeUnit;
}[] => {
  return [
    { label: t('date-helper:day'), value: 'day' },
    { label: t('date-helper:week'), value: 'week' },
    { label: t('date-helper:month'), value: 'month' },
    { label: t('date-helper:year'), value: 'year' },
    { label: t('date-helper:all'), value: 'all' },
    { label: t('date-helper:custom'), value: 'custom' },
  ];
};

export const getDateRangeOptions = (
  unit: DateRangeUnit,
  t: Translate
): {
  label: string;
  value: DateRangeOption;
}[] => {
  switch (unit) {
    case 'day':
      return [
        { label: t('date-helper:today'), value: 'present' },
        { label: t('date-helper:yesterday'), value: 'past' },
        { label: t('date-helper:tomorrow'), value: 'future' },
      ];

    case 'week':
      return [
        { label: t('date-helper:this-week'), value: 'present' },
        { label: t('date-helper:last-week'), value: 'past' },
        { label: t('date-helper:next-week'), value: 'future' },
      ];

    case 'month':
      return [
        { label: t('date-helper:this-month'), value: 'present' },
        { label: t('date-helper:last-month'), value: 'past' },
        { label: t('date-helper:next-month'), value: 'future' },
      ];

    case 'year':
      return [
        { label: t('date-helper:this-year'), value: 'present' },
        { label: t('date-helper:last-year'), value: 'past' },
        { label: t('date-helper:next-year'), value: 'future' },
      ];

    case 'all':
      return [{ label: t('date-helper:all'), value: 'present' }];

    default:
      return [];
  }
};
