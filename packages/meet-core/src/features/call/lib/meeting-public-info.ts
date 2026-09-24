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

/** Request-local cache only: revoking public visibility takes effect on the next request. */
export const getMeetingPublicInfo = cache(
  async (code: string): Promise<MeetingPublicInfo | null> => {
    const meetingId = decodeRoomCode(code);
    if (!meetingId) return null;
    try {
      if (await isParleySession(meetingId)) return null;
      const db = await createAdminClient({ noCookie: true });
      const { data, error } = await db
        .from('workspace_meetings')
        .select('id, ws_id, creator_id, name, time')
        .eq('id', meetingId)
        .maybeSingle();
      if (error || !data) return null;
      // Server-only policy read. This token never reaches the public response.
      const policy = await readMeetingRoomPolicy({
        meetingId,
        wsId: data.ws_id,
        userId: data.creator_id,
        isHost: true,
      });
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
);
