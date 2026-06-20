import type {
  WorkspaceUserGroupScheduleGroupSummary,
  WorkspaceUserGroupSchedulePattern,
  WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import dayjs from 'dayjs';
import '@/lib/dayjs-setup';
import { normalizeWorkspaceUserSearchText } from '@/lib/workspace-user-search';
import { DEFAULT_SCHEDULE_TIMEZONE } from './session-time-utils';
import type { GroupedSessionTimeblock } from './user-group-calendar-density';

const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function zonedDate(value: string, timezone: string) {
  if (!timezone || timezone === 'auto') return dayjs(value);
  return dayjs(value).tz(timezone);
}

export function formatTimeblockRange(
  timeblock: GroupedSessionTimeblock,
  locale: string
) {
  const timezone = timeblock.timezone || DEFAULT_SCHEDULE_TIMEZONE;
  const start = zonedDate(timeblock.startAt, timezone).locale(locale);
  const end = zonedDate(timeblock.endAt, timezone).locale(locale);
  const endFormat = start.isSame(end, 'day') ? 'HH:mm' : 'ddd, MMM D, HH:mm';

  return `${start.format('ddd, MMM D, HH:mm')} - ${end.format(endFormat)} ${timezone}`;
}

export function sessionName(
  session: WorkspaceUserGroupSession,
  untitledSession: string
) {
  return session.groupName || session.title || untitledSession;
}

function sortedWeekdays(daysOfWeek: number[]) {
  return Array.from(new Set(daysOfWeek)).sort(
    (a, b) =>
      WEEKDAY_DISPLAY_ORDER.indexOf(a) - WEEKDAY_DISPLAY_ORDER.indexOf(b)
  );
}

export function formatSchedulePatternDays(
  daysOfWeek: number[],
  locale: string
) {
  return sortedWeekdays(daysOfWeek)
    .map((day) => dayjs().day(day).locale(locale).format('ddd'))
    .join('/');
}

export function formatSchedulePatternChip(
  pattern: WorkspaceUserGroupSchedulePattern,
  locale: string
) {
  return `${formatSchedulePatternDays(pattern.daysOfWeek, locale)} ${pattern.startTime}-${pattern.endTime}`;
}

export function buildScheduleSummarySearchText(
  summary: WorkspaceUserGroupScheduleGroupSummary | undefined,
  locale: string
) {
  if (!summary) return '';

  return [
    `${summary.managerCount} managers`,
    `${summary.nonManagerCount} members`,
    `${summary.upcomingCount} upcoming`,
    `${summary.exceptionCount} exceptions`,
    ...summary.patterns.flatMap((pattern) => [
      formatSchedulePatternChip(pattern, locale),
      pattern.daysOfWeek.join(' '),
      pattern.startTime,
      pattern.endTime,
    ]),
  ].join(' ');
}

function boundedLevenshtein(a: string, b: string, maxDistance: number) {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];

    for (let j = 1; j <= b.length; j += 1) {
      const cost = (a[i - 1] ?? '') === (b[j - 1] ?? '') ? 0 : 1;
      const above = previous[j] ?? maxDistance + 1;
      const left = current[j - 1] ?? maxDistance + 1;
      const diagonal = previous[j - 1] ?? maxDistance + 1;
      current[j] = Math.min(above + 1, left + 1, diagonal + cost);
      rowMin = Math.min(rowMin, current[j] ?? maxDistance + 1);
    }

    if (rowMin > maxDistance) return maxDistance + 1;
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length] ?? maxDistance + 1;
}

function matchesFuzzyToken(haystackToken: string, queryToken: string) {
  if (!queryToken) return true;
  if (haystackToken.includes(queryToken)) return true;
  if (queryToken.length < 4 || haystackToken.length < 4) return false;

  const maxDistance = queryToken.length >= 6 ? 2 : 1;
  return (
    boundedLevenshtein(haystackToken, queryToken, maxDistance) <= maxDistance
  );
}

export function matchesGroupedTimeblockSearch(
  values: Array<string | null | undefined>,
  searchValue: string
) {
  const query = normalizeWorkspaceUserSearchText(searchValue);
  if (!query) return true;

  const haystack = normalizeWorkspaceUserSearchText(
    values.filter(Boolean).join(' ')
  );
  if (!haystack) return false;
  if (haystack.includes(query)) return true;

  const haystackTokens = haystack.split(/\s+/).filter(Boolean);
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((queryToken) =>
      haystackTokens.some((haystackToken) =>
        matchesFuzzyToken(haystackToken, queryToken)
      )
    );
}

export function searchSession(
  session: WorkspaceUserGroupSession,
  searchValue: string,
  untitledSession: string,
  summary?: WorkspaceUserGroupScheduleGroupSummary,
  rosterSearchText = '',
  locale = 'en'
) {
  return matchesGroupedTimeblockSearch(
    [
      sessionName(session, untitledSession),
      session.title,
      ...session.tags.map((tag) => tag.name),
      buildScheduleSummarySearchText(summary, locale),
      rosterSearchText,
    ],
    searchValue
  );
}
