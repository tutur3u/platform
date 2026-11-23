import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import {
  MEET_CANONICAL_ORIGIN,
  MEET_LEGACY_ORIGIN,
} from '@tuturuuu/utils/meet-url';
import type { InvitationSnapshot } from './snapshot';

export type GuestRow =
  Database['public']['Tables']['calendar_event_guests']['Row'];
export type InvitationSettingsRow =
  Database['public']['Tables']['calendar_event_invitation_settings']['Row'];
export type CalendarEventRow =
  Database['public']['Tables']['workspace_calendar_events']['Row'];

export class InvitationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'InvitationError';
  }
}

export type EventDecryptor = (
  event: CalendarEventRow,
  wsId: string
) => Promise<CalendarEventRow>;

const ICAL_UID_DOMAIN = 'calendar.tuturuuu.com';

export function icalUidForEvent(eventId: string) {
  return `${eventId}@${ICAL_UID_DOMAIN}`;
}

/** Accept only Tuturuuu Meet links as conferencing URLs. */
export function normalizeMeetConferenceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (url.origin === MEET_LEGACY_ORIGIN) return url.href;
    if (
      url.origin === MEET_CANONICAL_ORIGIN &&
      url.pathname.startsWith('/meet/')
    )
      return url.href;
    return null;
  } catch {
    return null;
  }
}

export function conferenceUrlForEvent(
  event: Pick<CalendarEventRow, 'scheduling_metadata'>,
  settings: Pick<InvitationSettingsRow, 'conference_url'> | null
) {
  const fromSettings = normalizeMeetConferenceUrl(settings?.conference_url);
  if (fromSettings) return fromSettings;
  const metadata = event.scheduling_metadata as Record<string, unknown> | null;
  return metadata?.type === 'tuturuuu_meeting'
    ? normalizeMeetConferenceUrl(metadata.meeting_url)
    : null;
}

export async function loadOrganizerIdentity(
  sbAdmin: TypedSupabaseClient,
  userId: string
) {
  const [{ data: privateDetails }, { data: profile }] = await Promise.all([
    sbAdmin
      .from('user_private_details')
      .select('email, full_name')
      .eq('user_id', userId)
      .maybeSingle(),
    sbAdmin.from('users').select('display_name').eq('id', userId).maybeSingle(),
  ]);
  const email = privateDetails?.email?.trim().toLowerCase();
  if (!email) {
    throw new InvitationError(
      'The organizer needs a verified email address to send invitations',
      409,
      'organizer_email_missing'
    );
  }
  const name =
    profile?.display_name?.trim() || privateDetails?.full_name?.trim() || null;
  return { userId, email, name };
}

export async function loadInvitationEvent(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  eventId: string
) {
  const { data: event, error } = await sbAdmin
    .from('workspace_calendar_events')
    .select('*')
    .eq('id', eventId)
    .eq('ws_id', wsId)
    .maybeSingle();
  if (error) throw error;
  if (!event) throw new InvitationError('Event not found', 404, 'not_found');
  return event;
}

/**
 * Native guests belong to Tuturuuu-owned events. Provider events keep their
 * provider attendees, so Google or Microsoft stays the only sender.
 */
export function assertNativeInvitationEvent(event: CalendarEventRow) {
  if (event.provider && event.provider !== 'tuturuuu') {
    throw new InvitationError(
      'Guests on this event are managed by its connected calendar',
      409,
      'provider_event'
    );
  }
}

export async function ensureInvitationSettings(
  sbAdmin: TypedSupabaseClient,
  input: { wsId: string; eventId: string; organizerUserId: string }
) {
  const { data: existing, error } = await sbAdmin
    .from('calendar_event_invitation_settings')
    .select('*')
    .eq('event_id', input.eventId)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing;

  const { data: created, error: insertError } = await sbAdmin
    .from('calendar_event_invitation_settings')
    .upsert(
      {
        event_id: input.eventId,
        ws_id: input.wsId,
        organizer_user_id: input.organizerUserId,
        ical_uid: icalUidForEvent(input.eventId),
      },
      { onConflict: 'event_id', ignoreDuplicates: true }
    )
    .select('*')
    .maybeSingle();
  if (insertError) throw insertError;
  if (created) return created;

  // A concurrent request created it first.
  const { data: raced, error: racedError } = await sbAdmin
    .from('calendar_event_invitation_settings')
    .select('*')
    .eq('event_id', input.eventId)
    .single();
  if (racedError) throw racedError;
  return raced;
}

export async function listEventGuests(
  sbAdmin: TypedSupabaseClient,
  eventId: string
) {
  const { data, error } = await sbAdmin
    .from('calendar_event_guests')
    .select('*')
    .eq('event_id', eventId)
    .order('is_organizer', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function buildInvitationSnapshot(input: {
  event: CalendarEventRow;
  settings: InvitationSettingsRow;
  guests: GuestRow[];
  organizer: { userId: string; email: string; name: string | null };
  display?: { allDay?: boolean; timeZone?: string | null };
}): InvitationSnapshot {
  const { event, settings, guests, organizer, display } = input;
  return {
    v: 1,
    eventId: event.id,
    wsId: event.ws_id,
    uid: settings.ical_uid,
    sequence: settings.ical_sequence,
    title: (event.title ?? '').slice(0, 1024),
    description: event.description?.slice(0, 8000) || null,
    location: event.location?.slice(0, 1000) || null,
    conferenceUrl: conferenceUrlForEvent(event, settings),
    start: new Date(event.start_at).toISOString(),
    end: new Date(event.end_at).toISOString(),
    allDay: display?.allDay === true,
    timeZone: display?.timeZone ?? null,
    organizer: {
      email: organizer.email,
      name: organizer.name,
      userId: organizer.userId,
    },
    guestsCanSeeGuestList: settings.guests_can_see_guest_list,
    attendees: guests.slice(0, 101).map((guest) => ({
      email: guest.email,
      name: guest.display_name,
      status:
        guest.rsvp_status as InvitationSnapshot['attendees'][number]['status'],
      optional: guest.is_optional,
    })),
  };
}
