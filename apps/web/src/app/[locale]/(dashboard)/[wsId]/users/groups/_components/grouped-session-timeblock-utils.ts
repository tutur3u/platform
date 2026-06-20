import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import dayjs from 'dayjs';
import '@/lib/dayjs-setup';
import { DEFAULT_SCHEDULE_TIMEZONE } from './session-time-utils';
import type { GroupedSessionTimeblock } from './user-group-calendar-density';

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

export function searchSession(
  session: WorkspaceUserGroupSession,
  searchValue: string,
  untitledSession: string
) {
  const query = searchValue.trim().toLocaleLowerCase();
  if (!query) return true;

  return [
    sessionName(session, untitledSession),
    session.title,
    ...session.tags.map((tag) => tag.name),
  ]
    .filter(Boolean)
    .some((value) => value!.toLocaleLowerCase().includes(query));
}
