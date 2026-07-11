'use client';

import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import dayjs from 'dayjs';
import '@tuturuuu/users-core/lib/dayjs-setup';

export const DEFAULT_SCHEDULE_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 22;
export const SLOT_MINUTES = 30;

export function getWeekStart(value: Date) {
  const date = dayjs(value);
  const day = date.day();
  const diff = day === 0 ? -6 : 1 - day;
  return date.add(diff, 'day').startOf('day').toDate();
}

export function getWeekDays(weekStart: Date) {
  return Array.from({ length: 7 }, (_, index) =>
    dayjs(weekStart).add(index, 'day').toDate()
  );
}

export function getTimeSlots() {
  const slots: { hour: number; minute: number; value: string }[] = [];
  for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour += 1) {
    slots.push({
      hour,
      minute: 0,
      value: `${hour.toString().padStart(2, '0')}:00`,
    });
    slots.push({
      hour,
      minute: 30,
      value: `${hour.toString().padStart(2, '0')}:30`,
    });
  }
  return slots;
}

export function sessionLocalDate(
  session: WorkspaceUserGroupSession,
  timezone = session.startTimezone || DEFAULT_SCHEDULE_TIMEZONE
) {
  return dayjs(session.startsAt).tz(timezone).format('YYYY-MM-DD');
}

export function sessionSlotKey(session: WorkspaceUserGroupSession) {
  const start = dayjs(session.startsAt).tz(
    session.startTimezone || DEFAULT_SCHEDULE_TIMEZONE
  );
  const minute = start.minute() < 30 ? 0 : 30;
  return `${start.format('YYYY-MM-DD')}T${start.hour().toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

export function sessionDurationMinutes(session: WorkspaceUserGroupSession) {
  return Math.max(
    dayjs(session.endsAt).diff(dayjs(session.startsAt), 'minute'),
    15
  );
}

export function buildZonedIso(
  date: string,
  time: string,
  timezone = DEFAULT_SCHEDULE_TIMEZONE
) {
  return dayjs.tz(`${date} ${time}`, timezone).toISOString();
}

export function moveSessionToSlot(
  session: WorkspaceUserGroupSession,
  date: string,
  time: string
) {
  const timezone = session.startTimezone || DEFAULT_SCHEDULE_TIMEZONE;
  const startsAt = dayjs.tz(`${date} ${time}`, timezone);
  return {
    endsAt: startsAt
      .add(sessionDurationMinutes(session), 'minute')
      .toISOString(),
    startsAt: startsAt.toISOString(),
  };
}

export function resizeSessionByMinutes(
  session: WorkspaceUserGroupSession,
  deltaMinutes: number
) {
  const nextEnd = dayjs(session.endsAt).add(deltaMinutes, 'minute');
  const minEnd = dayjs(session.startsAt).add(15, 'minute');
  return (nextEnd.isAfter(minEnd) ? nextEnd : minEnd).toISOString();
}

export function formatSessionTime(session: WorkspaceUserGroupSession) {
  const startTz = session.startTimezone || DEFAULT_SCHEDULE_TIMEZONE;
  const endTz = session.endTimezone || startTz;
  const start = dayjs(session.startsAt).tz(startTz).format('HH:mm');
  const end = dayjs(session.endsAt).tz(endTz).format('HH:mm');
  return `${start}-${end} ${startTz}`;
}

export function localDateTimeParts(
  iso: string,
  timezone = DEFAULT_SCHEDULE_TIMEZONE
) {
  const local = dayjs(iso).tz(timezone);
  return {
    date: local.format('YYYY-MM-DD'),
    time: local.format('HH:mm'),
  };
}
