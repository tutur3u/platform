import moment from 'moment';

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

export const dateRangeUnits: {
  label: string;
  value: DateRangeUnit;
}[] = [
  { label: 'Ngày', value: 'day' },
  { label: 'Tuần', value: 'week' },
  { label: 'Tháng', value: 'month' },
  { label: 'Năm', value: 'year' },
  { label: 'Tất cả', value: 'all' },
  { label: 'Tùy chỉnh', value: 'custom' },
];

export const getDateRangeOptions = (
  unit: DateRangeUnit
): {
  label: string;
  value: DateRangeOption;
}[] => {
  switch (unit) {
    case 'day':
      return [
        { label: 'Hôm nay', value: 'present' },
        { label: 'Ngày hôm qua', value: 'past' },
        { label: 'Ngày mai', value: 'future' },
      ];

    case 'week':
      return [
        { label: 'Tuần này', value: 'present' },
        { label: 'Tuần trước', value: 'past' },
        { label: 'Tuần sau', value: 'future' },
      ];

    case 'month':
      return [
        { label: 'Tháng này', value: 'present' },
        { label: 'Tháng trước', value: 'past' },
        { label: 'Tháng sau', value: 'future' },
      ];

    case 'year':
      return [
        { label: 'Năm nay', value: 'present' },
        { label: 'Năm trước', value: 'past' },
        { label: 'Năm sau', value: 'future' },
      ];

    case 'all':
      return [{ label: 'Tất cả', value: 'present' }];

    default:
      return [];
  }
};
