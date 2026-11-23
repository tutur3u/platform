import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types';
import { meetPublicUrl } from '@tuturuuu/utils/meet-url';
import {
  assertNativeInvitationEvent,
  type CalendarEventRow,
  ensureInvitationSettings,
  InvitationError,
  loadInvitationEvent,
} from './context';

export function meetingUrlFor(wsId: string, meetingId: string) {
  return meetPublicUrl(
    `/${encodeURIComponent(wsId)}/meetings/${encodeURIComponent(meetingId)}`
  );
}

function schedulingMetadata(event: CalendarEventRow) {
  const value = event.scheduling_metadata;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null;
}

/**
 * Create a Tuturuuu Meet room for an event (or link an existing room of the
 * same workspace) and record it as the event's conferencing link. Events
 * without other scheduling metadata also carry the `tuturuuu_meeting`
 * marker, which Meet uses to show the scheduled event.
 */
export async function linkEventMeeting(
  sbAdmin: TypedSupabaseClient,
  input: {
    wsId: string;
    eventId: string;
    actorUserId: string;
    meetingId?: string;
    decrypt: (event: CalendarEventRow) => Promise<CalendarEventRow>;
  }
) {
  const stored = await loadInvitationEvent(sbAdmin, input.wsId, input.eventId);
  assertNativeInvitationEvent(stored);
  const settings = await ensureInvitationSettings(sbAdmin, {
    wsId: input.wsId,
    eventId: input.eventId,
    organizerUserId: input.actorUserId,
  });
  if (settings.meet_meeting_id && !input.meetingId) {
    return {
      meetingId: settings.meet_meeting_id,
      url: meetingUrlFor(input.wsId, settings.meet_meeting_id),
      created: false,
    };
  }

  let meetingId = input.meetingId ?? null;
  let created = false;
  if (meetingId) {
    const { data: meeting, error } = await sbAdmin
      .from('workspace_meetings')
      .select('id')
      .eq('id', meetingId)
      .eq('ws_id', input.wsId)
      .maybeSingle();
    if (error) throw error;
    if (!meeting)
      throw new InvitationError('Meeting not found', 404, 'meeting_not_found');
  } else {
    const event = await input.decrypt(stored);
    const { data: meeting, error } = await sbAdmin
      .from('workspace_meetings')
      .insert({
        ws_id: input.wsId,
        // Meeting names are not encrypted, so never copy an encrypted title.
        name: stored.is_encrypted
          ? 'Meeting'
          : (event.title || 'Meeting').slice(0, 255),
        time: event.start_at,
        creator_id: input.actorUserId,
      })
      .select('id')
      .single();
    if (error) throw error;
    meetingId = meeting.id;
    created = true;
  }

  const url = meetingUrlFor(input.wsId, meetingId);
  const { error: settingsError } = await sbAdmin
    .from('calendar_event_invitation_settings')
    .update({ meet_meeting_id: meetingId, conference_url: url })
    .eq('event_id', input.eventId);
  if (settingsError) throw settingsError;

  const metadata = schedulingMetadata(stored);
  if (!metadata || metadata.type === 'tuturuuu_meeting') {
    const { error: eventError } = await sbAdmin
      .from('workspace_calendar_events')
      .update({
        scheduling_metadata: {
          ...(metadata ?? {}),
          type: 'tuturuuu_meeting',
          meeting_id: meetingId,
          meeting_url: url,
        },
      })
      .eq('id', input.eventId)
      .eq('ws_id', input.wsId);
    if (eventError) throw eventError;
  }

  return { meetingId, url, created };
}

/** Remove the Meet link from an event. The room itself is kept. */
export async function unlinkEventMeeting(
  sbAdmin: TypedSupabaseClient,
  input: { wsId: string; eventId: string }
) {
  const stored = await loadInvitationEvent(sbAdmin, input.wsId, input.eventId);
  assertNativeInvitationEvent(stored);
  const { error } = await sbAdmin
    .from('calendar_event_invitation_settings')
    .update({ meet_meeting_id: null, conference_url: null })
    .eq('event_id', input.eventId);
  if (error) throw error;
  const metadata = schedulingMetadata(stored);
  if (metadata?.type === 'tuturuuu_meeting') {
    const { error: eventError } = await sbAdmin
      .from('workspace_calendar_events')
      .update({ scheduling_metadata: null })
      .eq('id', input.eventId)
      .eq('ws_id', input.wsId);
    if (eventError) throw eventError;
  }
}

/** Task, meeting and conferencing links shown with an event. */
export async function loadEventLinks(
  sbAdmin: TypedSupabaseClient,
  input: { wsId: string; event: CalendarEventRow; meetMeetingId: string | null }
) {
  const metadata = schedulingMetadata(input.event);
  const meetingId =
    input.meetMeetingId ??
    (metadata?.type === 'tuturuuu_meeting' &&
    typeof metadata.meeting_id === 'string'
      ? metadata.meeting_id
      : null);

  let taskId = input.event.task_id;
  if (!taskId) {
    const { data } = await sbAdmin
      .from('task_calendar_events')
      .select('task_id')
      .eq('event_id', input.event.id)
      .limit(1)
      .maybeSingle();
    taskId = data?.task_id ?? null;
  }
  let task: { id: string; name: string } | null = null;
  if (taskId) {
    const { data } = await sbAdmin
      .from('tasks')
      .select('id, name')
      .eq('id', taskId)
      .maybeSingle();
    task = data ? { id: data.id, name: data.name } : null;
  }

  return {
    meeting: meetingId
      ? { id: meetingId, url: meetingUrlFor(input.wsId, meetingId) }
      : null,
    task,
  };
}
