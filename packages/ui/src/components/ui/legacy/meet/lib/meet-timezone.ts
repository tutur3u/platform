import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { formatMinuteOfDay, type MeetRankedTimeframe } from './meet-insights';

dayjs.extend(utc);
dayjs.extend(timezone);

function legacyOffset(plan: MeetTogetherPlan) {
  const offset = plan.start_time?.match(/([+-]\d{2}(?::?\d{2})?)$/u)?.[1];
  if (!offset) return 'Z';
  if (/^[+-]\d{2}$/u.test(offset)) return `${offset}:00`;
  if (/^[+-]\d{4}$/u.test(offset))
    return `${offset.slice(0, 3)}:${offset.slice(3)}`;
  return offset;
}

function localTimestamp(date: string, minute: number) {
  return `${date}T${formatMinuteOfDay(minute)}:00`;
}

export function candidateToAbsoluteRange(
  candidate: MeetRankedTimeframe,
  plan: MeetTogetherPlan
) {
  const startLocal = localTimestamp(candidate.date, candidate.startMinute);
  const endLocal = localTimestamp(candidate.date, candidate.endMinute);
  const start = plan.timezone
    ? dayjs.tz(startLocal, plan.timezone)
    : dayjs(`${startLocal}${legacyOffset(plan)}`);
  const end = plan.timezone
    ? dayjs.tz(endLocal, plan.timezone)
    : dayjs(`${endLocal}${legacyOffset(plan)}`);
  const expectedDuration = plan.duration_minutes ?? 60;

  if (
    !start.isValid() ||
    !end.isValid() ||
    end.diff(start, 'minute') !== expectedDuration
  )
    return null;

  return { startAt: start.toISOString(), endAt: end.toISOString() };
}
