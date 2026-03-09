import '@/lib/dayjs-setup';
import dayjs from 'dayjs';
import { parseAsString, parseAsStringLiteral } from 'nuqs';

export const SESSION_HISTORY_DATE_FORMAT = 'YYYY-MM-DD';

export const sessionHistoryViewModes = ['day', 'week', 'month'] as const;

export const sessionHistorySearchParamParsers = {
  historyPeriod: parseAsStringLiteral(sessionHistoryViewModes),
  historyDate: parseAsString,
};

export function parseSessionHistoryDate(
  value: string | null | undefined,
  timezoneName: string
) {
  const fallbackDate = dayjs().tz(timezoneName).startOf('day');

  if (!value) {
    return fallbackDate;
  }

  const parsedDate = dayjs(value, SESSION_HISTORY_DATE_FORMAT, true);

  if (!parsedDate.isValid()) {
    return fallbackDate;
  }

  return parsedDate.tz(timezoneName, true).startOf('day');
}

export function formatSessionHistoryDate(date: dayjs.Dayjs) {
  return date.format(SESSION_HISTORY_DATE_FORMAT);
}
