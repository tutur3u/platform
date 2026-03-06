import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { parseAsString, parseAsStringLiteral } from 'nuqs';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

export const SESSION_HISTORY_DATE_FORMAT = 'YYYY-MM-DD';

export const sessionHistoryViewModes = ['day', 'week', 'month'] as const;

export const sessionHistorySearchParamParsers = {
  period: parseAsStringLiteral(sessionHistoryViewModes),
  date: parseAsString,
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
