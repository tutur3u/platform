import type { MeetClassFeatures } from './class-features';
import { meetClassRole, presentClassTimer } from './class-timer';
import type { MeetRealtimeServerMessage } from './messages';
import {
  canEnableMeetClassViewers,
  canMeetRealtimeManageParticipants,
} from './permissions';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomSnapshot } from './room';
import { MEET_MEDIA_CAPABILITIES } from './simulcast-layers';
import { resolveMeetStreamEntitlement } from './stream-tiers';

export function buildReady(
  state: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload,
  admission: 'admitted' | 'waiting',
  now: string,
  features: MeetClassFeatures
): Extract<MeetRealtimeServerMessage, { type: 'ready' }> {
  const timer = features.timer
    ? presentClassTimer(state.classTimer, now)
    : null;
  return {
    admission,
    canManageParticipants: canMeetRealtimeManageParticipants(token),
    ...(token.eventHost ? { eventHost: true as const } : {}),
    classRole: meetClassRole(token),
    ...(canEnableMeetClassViewers(token)
      ? { classViewersAvailable: true }
      : {}),
    classAttendanceEnabled: features.attendance,
    classTimerEnabled: features.timer,
    ...(admission === 'admitted' && features.timer
      ? { classTimer: timer, serverNow: now }
      : {}),
    tracks: admission === 'admitted' ? Object.values(state.tracks) : [],
    expiresAt: new Date(token.exp * 1000).toISOString(),
    roomExpiresAt: state.budget
      ? new Date(state.budget.expiresAt).toISOString()
      : undefined,
    limits: {
      ...token.limits,
      maxParticipants:
        state.budget?.maxParticipants ?? token.limits.maxParticipants,
      maxPublishers: state.budget?.maxPublishers ?? token.limits.maxPublishers,
      maxViewers: state.budget?.maxViewers ?? token.limits.maxViewers,
    },
    mediaCapabilities: [...MEET_MEDIA_CAPABILITIES],
    streamLimits: resolveMeetStreamEntitlement(token.limits.stream),
    mode: token.mode,
    role: token.role,
    roomId: token.roomId,
    stage: state.stage,
    type: 'ready',
    userId: token.userId,
  };
}
