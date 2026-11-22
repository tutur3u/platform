'use client';

import type { CallState } from '../lib/call-state';
import { AttendancePanel } from './attendance-panel';
import { ClassTimerChip } from './class-timer';
import { RoomCountdown } from './room-countdown';

/**
 * The top bar's clocks: the room's time limit, the room timer while one is
 * set (read-only here; hosts change it from Activities), and attendance for
 * hosts and co-hosts.
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
  return (
    <div className="flex max-w-full flex-wrap items-center gap-1">
      <RoomCountdown expiresAt={state.roomExpiresAt} />
      {state.classTimerEnabled && state.classTimer && (
        <ClassTimerChip
          timer={state.classTimer}
          serverNow={state.classTimerServerNow}
        />
      )}
      {canView && <AttendancePanel meetingId={meetingId} />}
    </div>
  );
}
