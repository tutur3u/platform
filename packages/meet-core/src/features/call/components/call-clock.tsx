'use client';

import { cn } from '@tuturuuu/utils/format';
import type { CallState } from '../lib/call-state';
import { AttendancePanel } from './attendance-panel';
import { ClassTimerChip, useClassTimerAnnouncement } from './class-timer';
import { RoomCountdown } from './room-countdown';

/**
 * The call's clocks: the room's time limit and the room timer while one is
 * set (read-only here; hosts change it from Activities). From `lg` up they sit
 * at the leading edge of the control bar; phones keep them in the header,
 * where the bar has no room. Each placement hides the other with `display`,
 * so only one polite status is ever exposed. It stays mounted, empty until
 * the timer changes, so screen readers hear each change once.
 */
export function CallTimers({
  state,
  className,
  align = 'end',
}: {
  state: CallState;
  className?: string;
  /** Popover alignment: `start` at the bar's left edge, `end` in the header. */
  align?: 'start' | 'end';
}) {
  const timer = state.classTimerEnabled ? state.classTimer : null;
  const announcement = useClassTimerAnnouncement(
    timer,
    state.classTimerServerNow
  );
  return (
    <div className={cn('flex min-w-0 shrink-0 items-center gap-1', className)}>
      <RoomCountdown expiresAt={state.roomExpiresAt} align={align} />
      {timer && (
        <ClassTimerChip timer={timer} serverNow={state.classTimerServerNow} />
      )}
      <span aria-live="polite" className="sr-only" role="status">
        {announcement}
      </span>
    </div>
  );
}

/** Attendance for hosts and co-hosts, shown in the call header. */
export function CallAttendance({
  meetingId,
  state,
}: {
  meetingId: string;
  state: CallState;
}) {
  const canView =
    (state.classRole === 'host' || state.classRole === 'cohost') &&
    state.classAttendanceEnabled;
  return canView ? <AttendancePanel meetingId={meetingId} /> : null;
}

/**
 * The header's clocks: the timers on phones only (the call bar shows them
 * from `lg` up) and attendance for hosts and co-hosts at every width.
 */
export function CallClock({
  meetingId,
  state,
}: {
  meetingId: string;
  state: CallState;
}) {
  // No wrapper: from `lg` up the timers are hidden, and an empty wrapper
  // would still take a gap in the header's action row.
  return (
    <>
      <CallTimers state={state} className="lg:hidden" />
      <CallAttendance meetingId={meetingId} state={state} />
    </>
  );
}
