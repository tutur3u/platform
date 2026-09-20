import { createHash } from 'node:crypto';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { MeetingInvitationInput } from '@tuturuuu/utils/meeting-invitations';
import {
  decryptEventFromStorage,
  encryptEventForStorage,
  getWorkspaceKey,
} from '@/lib/workspace-encryption';
import { MeetingCreateError, withMeetingRequest } from './meeting-request';
import { createProviderEvent } from './provider-writes';
import type { ResolvedCalendarSource } from './source-resolver';

export { MeetingCreateError } from './meeting-request';
export interface InvitedMeetingInput {
  title: string;
  description?: string | null;
  location?: string | null;
  start_at: string;
  end_at: string;
  color?: string;
  locked?: boolean;
  invitation: MeetingInvitationInput;
  requestId: string;
}

export function meetingRequestIdentity(
  wsId: string,
  userId: string,
  requestId: string
) {
  const hex = createHash('sha256')
    .update(JSON.stringify(['meeting-v1', wsId, userId, requestId]))
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function createInvitedMeeting({
  sbAdmin,
  wsId,
  userId,
  source,
  input,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  userId: string;
  source: ResolvedCalendarSource;
  input: InvitedMeetingInput;
}) {
  if (
    source.provider === 'tuturuuu' ||
    !source.accountEmail ||
    !source.accessToken
  ) {
    throw new MeetingCreateError(
      409,
      'Choose a connected Google or Outlook calendar to invite attendees'
    );
  }
  if (new Date(input.start_at) >= new Date(input.end_at)) {
    throw new MeetingCreateError(400, 'Meeting end must be after its start');
  }
  const id = meetingRequestIdentity(wsId, userId, input.requestId);
  const requestHash = createHash('sha256')
    .update(
      JSON.stringify({
        title: input.title,
        description: input.description ?? '',
        location: input.location ?? '',
        start: new Date(input.start_at).toISOString(),
        end: new Date(input.end_at).toISOString(),
        color: input.color ?? 'blue',
        locked: input.locked ?? false,
        timeZone: input.invitation.timeZone,
        guests: [...input.invitation.guests].sort((a, b) =>
          a.email.localeCompare(b.email)
        ),
        provider: source.provider,
        connectionId: source.connectionId,
        calendarId: source.externalCalendarId,
      })
    )
    .digest('hex');
  return withMeetingRequest(
    { id, hash: requestHash, requestId: input.requestId },
    async (requestState) => {
      const readDraft = async () => {
        const result = await sbAdmin
          .from('workspace_calendar_events')
          .select('*')
          .eq('id', id)
          .eq('ws_id', wsId)
          .maybeSingle();
        if (result.error) throw result.error;
        return result.data;
      };
      let draft = await readDraft();
      if (!draft && !requestState.fresh) {
        throw new MeetingCreateError(
          409,
          'This meeting was removed or its original request did not complete. Check your calendar before trying again'
        );
      }
      if (!draft) {
        // Reserve the durable request before sending. Store only its hash and actor
        // in metadata; titles and descriptions retain workspace encryption rules.
        const fields = await encryptEventForStorage(
          wsId,
          {
            title: input.title,
            description: input.description ?? '',
            location: input.location,
          },
          await getWorkspaceKey(wsId)
        );
        const inserted = await sbAdmin
          .from('workspace_calendar_events')
          .insert({
            id,
            ws_id: wsId,
            ...fields,
            start_at: input.start_at,
            end_at: input.end_at,
            color: input.color ?? 'blue',
            locked: input.locked ?? false,
            provider: source.provider,
            source_calendar_id: source.workspaceCalendarId,
            external_calendar_id: source.externalCalendarId,
            scheduling_metadata: {
              meeting_request_hash: requestHash,
              meeting_organizer: userId,
              meeting_delivery: 'pending',
            },
          })
          .select('*')
          .single();
        if (inserted.error && inserted.error.code !== '23505')
          throw inserted.error;
        draft = inserted.data ?? (await readDraft());
      }
      if (!draft)
        throw new MeetingCreateError(503, 'Unable to reserve this meeting');
      const metadata = draft.scheduling_metadata as Record<
        string,
        unknown
      > | null;
      if (
        metadata?.meeting_request_hash !== requestHash ||
        metadata.meeting_organizer !== userId
      ) {
        throw new MeetingCreateError(
          409,
          'This meeting request was already used with different details'
        );
      }
      if (metadata.meeting_delivery === 'cancelled') {
        throw new MeetingCreateError(409, 'This meeting request was cancelled');
      }
      if (draft.external_event_id) return decryptEventFromStorage(draft, wsId);
      if (requestState.completed)
        throw new MeetingCreateError(
          409,
          'This meeting request already completed'
        );
      // Both providers receive the same stable idempotency identity on every retry.
      // A provider timeout must not erase the reserved request or mint a fresh ID.
      const provider = await createProviderEvent({
        source,
        idempotencyKey: id,
        event: {
          title: input.title,
          description: input.description ?? '',
          location: input.location ?? '',
          start_at: input.start_at,
          end_at: input.end_at,
          invitation: input.invitation,
        },
      });
      if (!provider)
        throw new MeetingCreateError(
          502,
          'Invitation delivery did not complete'
        );
      const { data, error } = await sbAdmin
        .from('workspace_calendar_events')
        .update({
          external_event_id: provider.externalEventId,
          google_calendar_id:
            source.provider === 'google' ? provider.externalCalendarId : null,
          google_event_id:
            source.provider === 'google' ? provider.externalEventId : null,
          scheduling_metadata: {
            meeting_request_hash: requestHash,
            meeting_organizer: userId,
            meeting_delivery: 'sent',
          },
        })
        .eq('id', id)
        .eq('ws_id', wsId)
        .select('*')
        .single();
      if (error) throw error;
      return decryptEventFromStorage(data, wsId);
    }
  );
}
