import 'server-only';
import { readMeetingRoomPolicy } from '@tuturuuu/meet-core/features/meeting-ai/server/room-access';
import { isParleySession } from '@tuturuuu/meet-core/parley/repository';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { cache } from 'react';
import { decodeRoomCode } from './room-code';

export type MeetingPublicInfo = {
  title: string;
  scheduledAt: string;
  ended: boolean;
};

type PublicInfoMeeting = {
  ws_id: string;
  creator_id: string;
  name: string;
  time: string;
};

/**
 * Data the public projection reads. A page that already loads the meeting row,
 * the Parley flag or the host's room policy passes them in so each is read once.
 */
export type MeetingPublicInfoSources = {
  isParleySession: () => Promise<boolean>;
  meeting: () => PromiseLike<{
    data: PublicInfoMeeting | null;
    error: unknown;
  }>;
  /** Must read the policy as the meeting host; only host tokens see settings. */
  hostPolicy: (
    meeting: PublicInfoMeeting
  ) => ReturnType<typeof readMeetingRoomPolicy>;
};

/** Fails closed: any lookup error keeps the meeting private. */
export async function resolveMeetingPublicInfo(
  sources: MeetingPublicInfoSources
): Promise<MeetingPublicInfo | null> {
  try {
    if (await sources.isParleySession()) return null;
    const { data, error } = await sources.meeting();
    if (error || !data) return null;
    // Server-only policy read. This token never reaches the public response.
    const policy = await sources.hostPolicy(data);
    if (!policy.settings?.publicLinkPreview) return null;
    return {
      title: data.name.trim().slice(0, 200),
      scheduledAt: data.time,
      ended: policy.ended,
    };
  } catch {
    // A storage or policy outage must not disclose private meeting details.
    return null;
  }
}

/** Request-local cache only: revoking public visibility takes effect on the next request. */
export const getMeetingPublicInfo = cache(
  async (code: string): Promise<MeetingPublicInfo | null> => {
    const meetingId = decodeRoomCode(code);
    if (!meetingId) return null;
    return resolveMeetingPublicInfo({
      isParleySession: () => isParleySession(meetingId),
      meeting: async () =>
        (await createAdminClient({ noCookie: true }))
          .from('workspace_meetings')
          .select('id, ws_id, creator_id, name, time')
          .eq('id', meetingId)
          .maybeSingle(),
      hostPolicy: (meeting) =>
        readMeetingRoomPolicy({
          meetingId,
          wsId: meeting.ws_id,
          userId: meeting.creator_id,
          isHost: true,
        }),
    });
  }
);
