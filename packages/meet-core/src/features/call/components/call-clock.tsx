'use client';

import type { CallState } from '../lib/call-state';
import { AttendancePanel } from './attendance-panel';
import { ClassTimerChip, useClassTimerAnnouncement } from './class-timer';
import { RoomCountdown } from './room-countdown';

/**
 * The top bar's clocks: the room's time limit, the room timer while one is
 * set (read-only here; hosts change it from Activities), and attendance for
 * hosts and co-hosts. One polite status stays mounted, empty until the
 * timer changes, so screen readers hear each change.
 */
export function CallClock({
  meetingId,
  state,
}: {
  meetingId: string;
  state: CallState;
}) {
  const canView =
    (state.classRole === 'host' || state.classRole === 'cohost') &&
    state.classAttendanceEnabled;
  const timer = state.classTimerEnabled ? state.classTimer : null;
  const announcement = useClassTimerAnnouncement(
    timer,
    state.classTimerServerNow
  );
  return (
    <div className="flex max-w-full flex-wrap items-center gap-1">
      <RoomCountdown expiresAt={state.roomExpiresAt} />
      {timer && (
        <ClassTimerChip timer={timer} serverNow={state.classTimerServerNow} />
      )}
      <span aria-live="polite" className="sr-only" role="status">
        {announcement}
      </span>
      {canView && <AttendancePanel meetingId={meetingId} />}
    </div>
  );
}
