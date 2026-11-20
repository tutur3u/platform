import 'server-only';
import { readMeetingRoomPolicy } from '@tuturuuu/meet-core/features/meeting-ai/server/room-access';
import { isParleySession } from '@tuturuuu/meet-core/parley/repository';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { canVerifiedAccountHostMeeting } from '@tuturuuu/utils/meet-hosting';
import { getMeetRealtimeTokenSecret } from './call-session';
import { assertMeetGuestAdmissionAllowed } from './guest-admission';
import { verifyMeetGuestSession } from './guest-session';

type GuestMeeting = {
  id: string;
  name: string | null;
  creator_id: string;
  ws_id: string;
};

/** Reads a caller has already started; each one replaces the identical lookup. */
export type MeetGuestJoinSources = {
  meeting?: () => PromiseLike<{ data: GuestMeeting | null; error: unknown }>;
  isParleySession?: () => Promise<boolean>;
  hostPolicy?: (
    meeting: GuestMeeting
  ) => ReturnType<typeof readMeetingRoomPolicy>;
  hostCanHost?: (meeting: GuestMeeting) => Promise<boolean>;
  turnstileConfigured?: () => boolean;
};

export type MeetGuestJoinState =
  | { kind: 'available'; meeting: GuestMeeting }
  | { kind: 'unavailable' };

/** Production needs both keys; local development runs Turnstile in test mode. */
export function isMeetGuestTurnstileConfigured(
  env: Record<string, string | undefined> = process.env
) {
  if (env.NODE_ENV === 'development') return true;
  return Boolean(
    env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() &&
    env.TURNSTILE_SECRET_KEY?.trim()
  );
}

export function meetGuestTurnstileSiteKey(
  env: Record<string, string | undefined> = process.env
) {
  const key = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  if (key) return key;
  // Cloudflare's documented always-pass test key, used only in development.
  return env.NODE_ENV === 'development' ? '1x00000000000000000000AA' : null;
}

async function defaultHostCanHost(meeting: GuestMeeting) {
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await admin.auth.admin.getUserById(
    meeting.creator_id
  );
  if (error) return false;
  return canVerifiedAccountHostMeeting(meeting.creator_id, data.user);
}

/**
 * Anonymous guests may join only when every gate holds: this is Meet (never
 * Parley), the host's plan allows hosting, the host turned guest join on, the
 * meeting has not ended, and Turnstile is configured. Any failure keeps the
 * meeting closed to people without an account.
 */
export async function resolveMeetGuestJoin(
  meetingId: string,
  sources: MeetGuestJoinSources = {}
): Promise<MeetGuestJoinState> {
  try {
    if (MEETING_APP !== 'meet') return { kind: 'unavailable' };
    if (!(sources.turnstileConfigured ?? isMeetGuestTurnstileConfigured)())
      return { kind: 'unavailable' };
    const parley = sources.isParleySession
      ? await sources.isParleySession()
      : await isParleySession(meetingId);
    if (parley) return { kind: 'unavailable' };
    const { data: meeting, error } = sources.meeting
      ? await sources.meeting()
      : await (
          await createAdminClient({ noCookie: true })
        )
          .from('workspace_meetings')
          .select('id, name, creator_id, ws_id')
          .eq('id', meetingId)
          .maybeSingle();
    if (error || !meeting?.creator_id || meeting.id !== meetingId)
      return { kind: 'unavailable' };
    const [policy, canHost] = await Promise.all([
      sources.hostPolicy
        ? sources.hostPolicy(meeting)
        : readMeetingRoomPolicy({
            meetingId,
            wsId: meeting.ws_id,
            userId: meeting.creator_id,
            isHost: true,
          }),
      (sources.hostCanHost ?? defaultHostCanHost)(meeting),
    ]);
    if (policy.ended || !canHost) return { kind: 'unavailable' };
    const settings = policy.settings as
      | { allowAnonymousGuests?: boolean }
      | undefined;
    if (settings?.allowAnonymousGuests !== true) return { kind: 'unavailable' };
    return { kind: 'available', meeting };
  } catch (error) {
    console.warn('Meet guest join check failed; keeping guests out', {
      kind: error instanceof Error ? error.name : 'unknown',
    });
    return { kind: 'unavailable' };
  }
}

export type MeetGuestCallAccess = {
  guest: true;
  turnstileVerified?: true;
  user: { id: string };
  meeting: GuestMeeting;
  isHost: false;
  displayName: string;
  avatarUrl: undefined;
  needsDisplayName: false;
  suggestedDisplayName: string;
  admission: 'lobby';
  canReadWorkspace: false;
  workspaceSlug: null;
};

/**
 * The call access for a signed guest cookie. The gates are checked again on
 * every page load and token refresh, so turning guest join off, ending the
 * meeting or a lapsed plan stops guests at their next token.
 */
export async function getMeetGuestCallAccess(
  meetingId: string,
  cookieValue: string | undefined | null,
  sources: MeetGuestJoinSources = {}
): Promise<MeetGuestCallAccess | null> {
  const session = await verifyMeetGuestSession(
    cookieValue,
    meetingId,
    getMeetRealtimeTokenSecret()
  );
  if (!session) return null;
  const state = await resolveMeetGuestJoin(meetingId, sources);
  if (state.kind !== 'available') return null;
  const access: MeetGuestCallAccess = {
    guest: true,
    ...(session.turnstileVerified ? { turnstileVerified: true } : {}),
    user: { id: session.guestId },
    meeting: state.meeting,
    isHost: false,
    displayName: session.displayName,
    avatarUrl: undefined,
    needsDisplayName: false,
    suggestedDisplayName: session.displayName,
    admission: 'lobby',
    canReadWorkspace: false,
    workspaceSlug: null,
  };
  await assertMeetGuestAdmissionAllowed(access);
  return access;
}
