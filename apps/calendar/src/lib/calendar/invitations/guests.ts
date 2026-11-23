import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { z } from 'zod';
import {
  assertNativeInvitationEvent,
  buildInvitationSnapshot,
  type CalendarEventRow,
  ensureInvitationSettings,
  type GuestRow,
  InvitationError,
  listEventGuests,
  loadInvitationEvent,
  loadOrganizerIdentity,
} from './context';
import {
  type InvitationDeliveryDeps,
  type QueueSummary,
  dispatchInvitationDeliveries,
  queueInvitationDeliveries,
} from './delivery';
import { loadEventLinks } from './meet-link';
import type { InvitationKind } from './snapshot';

export const MAX_GUESTS_PER_EVENT = 100;
export const MAX_GUESTS_PER_REQUEST = 50;

const DisplaySchema = z
  .object({
    allDay: z.boolean().optional(),
    timeZone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      })
      .optional(),
  })
  .strict();

export const GuestInputSchema = z.discriminatedUnion('source', [
  z
    .object({
      source: z.literal('member'),
      userId: z.guid(),
      optional: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      source: z.literal('contact'),
      contactId: z.guid(),
      optional: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      source: z.literal('email'),
      email: z
        .email()
        .max(320)
        .transform((value) => value.trim().toLowerCase()),
      name: z.string().trim().max(200).optional(),
      optional: z.boolean().optional(),
    })
    .strict(),
]);
export type GuestInput = z.infer<typeof GuestInputSchema>;

export const AddGuestsSchema = z
  .object({
    guests: z.array(GuestInputSchema).min(1).max(MAX_GUESTS_PER_REQUEST),
    notify: z.boolean().default(true),
    display: DisplaySchema.optional(),
  })
  .strict();

export const InvitationSettingsPatchSchema = z
  .object({
    guestsCanModify: z.boolean().optional(),
    guestsCanInviteOthers: z.boolean().optional(),
    guestsCanSeeGuestList: z.boolean().optional(),
  })
  .strict();

export const NotifyGuestsSchema = z
  .object({
    kind: z.enum(['update', 'cancel']),
    display: DisplaySchema.optional(),
  })
  .strict();

export const GuestPatchSchema = z.object({ optional: z.boolean() }).strict();

type ResolvedGuest = {
  email: string;
  display_name: string | null;
  user_id: string | null;
  contact_id: string | null;
  source: 'member' | 'contact' | 'email';
  is_optional: boolean;
};

/** Resolve identities server-side; never trust a client-supplied email for a member or contact. */
async function resolveGuests(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  inputs: GuestInput[]
): Promise<ResolvedGuest[]> {
  const memberIds = inputs.flatMap((g) =>
    g.source === 'member' ? [g.userId] : []
  );
  const contactIds = inputs.flatMap((g) =>
    g.source === 'contact' ? [g.contactId] : []
  );

  const [members, contacts] = await Promise.all([
    memberIds.length
      ? sbAdmin
          .from('workspace_members')
          .select(
            'user_id, users!inner(display_name, user_private_details(email))'
          )
          .eq('ws_id', wsId)
          .in('user_id', memberIds)
      : Promise.resolve({ data: [], error: null }),
    contactIds.length
      ? sbAdmin
          .from('workspace_users')
          .select('id, email, display_name, full_name')
          .eq('ws_id', wsId)
          .in('id', contactIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (members.error) throw members.error;
  if (contacts.error) throw contacts.error;

  const memberMap = new Map<
    string,
    { email: string | null; name: string | null }
  >();
  for (const row of (members.data ?? []) as Array<{
    user_id: string;
    users: {
      display_name: string | null;
      user_private_details:
        | { email: string | null }
        | Array<{ email: string | null }>
        | null;
    } | null;
  }>) {
    const details = row.users?.user_private_details;
    const email = Array.isArray(details) ? details[0]?.email : details?.email;
    memberMap.set(row.user_id, {
      email: email?.trim().toLowerCase() ?? null,
      name: row.users?.display_name ?? null,
    });
  }
  const contactMap = new Map(
    (contacts.data ?? []).map((row) => [row.id, row] as const)
  );

  const resolved: ResolvedGuest[] = [];
  for (const input of inputs) {
    if (input.source === 'member') {
      const member = memberMap.get(input.userId);
      if (!member?.email)
        throw new InvitationError(
          'A selected member cannot be invited',
          400,
          'member_not_found'
        );
      resolved.push({
        email: member.email,
        display_name: member.name,
        user_id: input.userId,
        contact_id: null,
        source: 'member',
        is_optional: input.optional ?? false,
      });
    } else if (input.source === 'contact') {
      const contact = contactMap.get(input.contactId);
      const email = contact?.email?.trim().toLowerCase();
      if (!contact || !email || !z.email().safeParse(email).success)
        throw new InvitationError(
          'A selected contact has no email address',
          400,
          'contact_without_email'
        );
      resolved.push({
        email,
        display_name: contact.display_name || contact.full_name || null,
        user_id: null,
        contact_id: contact.id,
        source: 'contact',
        is_optional: input.optional ?? false,
      });
    } else {
      resolved.push({
        email: input.email,
        display_name: input.name || null,
        user_id: null,
        contact_id: null,
        source: 'email',
        is_optional: input.optional ?? false,
      });
    }
  }
  return resolved;
}

async function loadNativeEvent(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  eventId: string
) {
  const event = await loadInvitationEvent(sbAdmin, wsId, eventId);
  assertNativeInvitationEvent(event);
  return event;
}

export async function getEventInvitation(
  sbAdmin: TypedSupabaseClient,
  input: { wsId: string; eventId: string }
) {
  const event = await loadInvitationEvent(sbAdmin, input.wsId, input.eventId);
  const [{ data: settings, error }, guests] = await Promise.all([
    sbAdmin
      .from('calendar_event_invitation_settings')
      .select('*')
      .eq('event_id', input.eventId)
      .maybeSingle(),
    listEventGuests(sbAdmin, input.eventId),
  ]);
  if (error) throw error;
  const links = await loadEventLinks(sbAdmin, {
    wsId: input.wsId,
    event,
    meetMeetingId: settings?.meet_meeting_id ?? null,
  });
  return {
    settings,
    guests,
    links,
    native: !event.provider || event.provider === 'tuturuuu',
  };
}

async function queueAndDispatch(
  deps: InvitationDeliveryDeps,
  input: {
    event: CalendarEventRow;
    actorUserId: string;
    kind: InvitationKind;
    recipients: GuestRow[];
    display?: z.infer<typeof DisplaySchema>;
  }
): Promise<QueueSummary> {
  const { sbAdmin } = deps;
  const settings = await ensureInvitationSettings(sbAdmin, {
    wsId: input.event.ws_id,
    eventId: input.event.id,
    organizerUserId: input.actorUserId,
  });
  // The manager who sends is the visible organizer and Reply-To, so no
  // manager can send under another member's name or address.
  const organizer = await loadOrganizerIdentity(sbAdmin, input.actorUserId);
  const guests = await listEventGuests(sbAdmin, input.event.id);
  const snapshot = buildInvitationSnapshot({
    event: input.event,
    settings,
    guests,
    organizer,
    display: input.display,
  });
  const summary = await queueInvitationDeliveries(deps, {
    snapshot,
    kind: input.kind,
    actorUserId: input.actorUserId,
    recipients: input.recipients.map((guest) => ({
      guestId: guest.id,
      email: guest.email,
    })),
  });
  if (summary.queued > 0) {
    await dispatchInvitationDeliveries(deps, {
      limit: Math.min(summary.queued + 5, 100),
    });
  }
  return summary;
}

export async function addEventGuests(
  deps: InvitationDeliveryDeps,
  input: {
    wsId: string;
    eventId: string;
    actorUserId: string;
    body: z.infer<typeof AddGuestsSchema>;
    decrypt: (event: CalendarEventRow) => Promise<CalendarEventRow>;
  }
) {
  const { sbAdmin } = deps;
  const stored = await loadNativeEvent(sbAdmin, input.wsId, input.eventId);
  const settings = await ensureInvitationSettings(sbAdmin, {
    wsId: input.wsId,
    eventId: input.eventId,
    organizerUserId: input.actorUserId,
  });
  const organizer = await loadOrganizerIdentity(
    sbAdmin,
    settings.organizer_user_id ?? input.actorUserId
  );

  const resolved = await resolveGuests(sbAdmin, input.wsId, input.body.guests);
  const unique = new Map<string, ResolvedGuest>();
  for (const guest of resolved)
    if (guest.email !== organizer.email) unique.set(guest.email, guest);

  // The organizer is always the first guest row.
  await sbAdmin.from('calendar_event_guests').upsert(
    {
      ws_id: input.wsId,
      event_id: input.eventId,
      email: organizer.email,
      display_name: organizer.name,
      user_id: organizer.userId,
      source: 'member',
      is_organizer: true,
      rsvp_status: 'accepted',
      responded_at: new Date().toISOString(),
      invited_by: input.actorUserId,
    },
    { onConflict: 'event_id,email', ignoreDuplicates: true }
  );

  const { data: inserted, error } = await sbAdmin
    .from('calendar_event_guests')
    .upsert(
      [...unique.values()].map((guest) => ({
        ...guest,
        ws_id: input.wsId,
        event_id: input.eventId,
        invited_by: input.actorUserId,
      })),
      { onConflict: 'event_id,email', ignoreDuplicates: true }
    )
    .select('*');
  if (error) {
    if (error.code === '23514' && error.message.includes('guest limit'))
      throw new InvitationError(
        `An event can have at most ${MAX_GUESTS_PER_EVENT} guests`,
        400,
        'guest_limit'
      );
    throw error;
  }

  const added = inserted ?? [];
  if (added.length) {
    await sbAdmin.from('calendar_invite_audit').insert(
      added.map((guest) => ({
        ws_id: input.wsId,
        event_id: input.eventId,
        guest_id: guest.id,
        actor_user_id: input.actorUserId,
        action: 'guest_added',
        detail: { source: guest.source },
      }))
    );
  }

  let delivery: QueueSummary | null = null;
  if (input.body.notify && added.length) {
    delivery = await queueAndDispatch(deps, {
      event: await input.decrypt(stored),
      actorUserId: input.actorUserId,
      kind: 'invite',
      recipients: added,
      display: input.body.display,
    });
  }
  return { added, delivery };
}

export async function removeEventGuest(
  deps: InvitationDeliveryDeps,
  input: {
    wsId: string;
    eventId: string;
    guestId: string;
    actorUserId: string;
    notify: boolean;
    decrypt: (event: CalendarEventRow) => Promise<CalendarEventRow>;
  }
) {
  const { sbAdmin } = deps;
  const stored = await loadNativeEvent(sbAdmin, input.wsId, input.eventId);
  const { data: guest, error } = await sbAdmin
    .from('calendar_event_guests')
    .select('*')
    .eq('id', input.guestId)
    .eq('event_id', input.eventId)
    .maybeSingle();
  if (error) throw error;
  if (!guest) throw new InvitationError('Guest not found', 404, 'not_found');
  if (guest.is_organizer)
    throw new InvitationError(
      'The organizer cannot be removed',
      400,
      'organizer'
    );

  if (input.notify && guest.last_invited_sequence !== null) {
    // Tell the removed guest the event is cancelled for them (RFC 5546).
    await queueAndDispatch(deps, {
      event: await input.decrypt(stored),
      actorUserId: input.actorUserId,
      kind: 'cancel',
      recipients: [guest],
    });
  }

  const { error: deleteError } = await sbAdmin
    .from('calendar_event_guests')
    .delete()
    .eq('id', guest.id);
  if (deleteError) throw deleteError;
  await sbAdmin.from('calendar_invite_audit').insert({
    ws_id: input.wsId,
    event_id: input.eventId,
    guest_id: guest.id,
    actor_user_id: input.actorUserId,
    action: 'guest_removed',
  });
}

export async function updateEventGuest(
  sbAdmin: TypedSupabaseClient,
  input: { wsId: string; eventId: string; guestId: string; optional: boolean }
) {
  await loadNativeEvent(sbAdmin, input.wsId, input.eventId);
  const { data, error } = await sbAdmin
    .from('calendar_event_guests')
    .update({ is_optional: input.optional })
    .eq('id', input.guestId)
    .eq('event_id', input.eventId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new InvitationError('Guest not found', 404, 'not_found');
  return data;
}

export async function updateInvitationSettings(
  sbAdmin: TypedSupabaseClient,
  input: {
    wsId: string;
    eventId: string;
    actorUserId: string;
    patch: z.infer<typeof InvitationSettingsPatchSchema>;
  }
) {
  await loadNativeEvent(sbAdmin, input.wsId, input.eventId);
  await ensureInvitationSettings(sbAdmin, {
    wsId: input.wsId,
    eventId: input.eventId,
    organizerUserId: input.actorUserId,
  });
  const update: Record<string, boolean> = {};
  if (input.patch.guestsCanModify !== undefined)
    update.guests_can_modify = input.patch.guestsCanModify;
  if (input.patch.guestsCanInviteOthers !== undefined)
    update.guests_can_invite_others = input.patch.guestsCanInviteOthers;
  if (input.patch.guestsCanSeeGuestList !== undefined)
    update.guests_can_see_guest_list = input.patch.guestsCanSeeGuestList;
  const { data, error } = await sbAdmin
    .from('calendar_event_invitation_settings')
    .update(update)
    .eq('event_id', input.eventId)
    .select('*')
    .single();
  if (error) throw error;
  await sbAdmin.from('calendar_invite_audit').insert({
    ws_id: input.wsId,
    event_id: input.eventId,
    actor_user_id: input.actorUserId,
    action: 'settings_updated',
    detail: update,
  });
  return data;
}

/**
 * Send an update or cancellation to every invited guest. Bumps SEQUENCE so
 * calendar clients replace their copy (RFC 5546 §2.1.4).
 */
export async function notifyEventGuests(
  deps: InvitationDeliveryDeps,
  input: {
    wsId: string;
    eventId: string;
    actorUserId: string;
    kind: 'update' | 'cancel';
    display?: z.infer<typeof DisplaySchema>;
    decrypt: (event: CalendarEventRow) => Promise<CalendarEventRow>;
  }
): Promise<QueueSummary | null> {
  const { sbAdmin } = deps;
  const stored = await loadInvitationEvent(sbAdmin, input.wsId, input.eventId);
  if (stored.provider && stored.provider !== 'tuturuuu') return null;
  const { data: settings, error } = await sbAdmin
    .from('calendar_event_invitation_settings')
    .select('*')
    .eq('event_id', input.eventId)
    .maybeSingle();
  if (error) throw error;
  if (!settings) return null;

  const guests = (await listEventGuests(sbAdmin, input.eventId)).filter(
    (guest) => !guest.is_organizer && guest.last_invited_sequence !== null
  );
  if (!guests.length) return null;

  const { error: bumpError } = await sbAdmin
    .from('calendar_event_invitation_settings')
    .update({
      ical_sequence: settings.ical_sequence + 1,
      ...(input.kind === 'cancel'
        ? { cancelled_at: new Date().toISOString() }
        : {}),
    })
    .eq('event_id', input.eventId)
    .eq('ical_sequence', settings.ical_sequence);
  if (bumpError) throw bumpError;

  if (input.kind === 'cancel') {
    await sbAdmin.from('calendar_invite_audit').insert({
      ws_id: input.wsId,
      event_id: input.eventId,
      actor_user_id: input.actorUserId,
      action: 'event_cancelled',
    });
    // Revoke outstanding RSVP links for a cancelled event.
    await sbAdmin
      .from('calendar_invite_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .in(
        'guest_id',
        guests.map((guest) => guest.id)
      )
      .eq('purpose', 'rsvp')
      .is('revoked_at', null);
  }

  return queueAndDispatch(deps, {
    event: await input.decrypt(stored),
    actorUserId: input.actorUserId,
    kind: input.kind,
    recipients: guests,
    display: input.display,
  });
}
