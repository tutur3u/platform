import { addDays, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';

const MINI_MONTH_DAY_COUNT = 42;

export function getMiniMonthDays(month: Date) {
  const firstVisibleDay = startOfWeek(startOfMonth(month), {
    weekStartsOn: 1,
  });
  const lastVisibleDay = endOfWeek(addDays(firstVisibleDay, 35), {
    weekStartsOn: 1,
  });
  const days: Date[] = [];

  for (
    let day = firstVisibleDay;
    day <= lastVisibleDay && days.length < MINI_MONTH_DAY_COUNT;
    day = addDays(day, 1)
  ) {
    days.push(day);
  }

  return days;
}
