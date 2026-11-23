import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { InvitationSnapshotSchema } from './snapshot';
import {
  hashInviteToken,
  type InviteTokenPurpose,
  isWellFormedInviteToken,
} from './tokens';

export type RsvpResponse = 'accepted' | 'declined' | 'tentative';

export type TokenLookup =
  | { ok: false; reason: 'invalid' | 'expired' }
  | {
      ok: true;
      tokenId: string;
      guest: {
        id: string;
        ws_id: string;
        event_id: string;
        email: string;
        rsvp_status: string;
      };
      event: {
        title: string;
        start: string;
        end: string;
        organizer: string;
      } | null;
      organizerUserId: string | null;
    };

/**
 * Resolve a link token without revealing whether it ever existed. Only
 * the guest row it is bound to is reachable, and only for its purpose.
 */
export async function lookupInviteToken(
  sbAdmin: TypedSupabaseClient,
  token: unknown,
  purpose: InviteTokenPurpose,
  now = new Date()
): Promise<TokenLookup> {
  if (!isWellFormedInviteToken(token)) return { ok: false, reason: 'invalid' };
  const { data, error } = await sbAdmin
    .from('calendar_invite_tokens')
    .select(
      'id, purpose, expires_at, revoked_at, calendar_event_guests!inner(id, ws_id, event_id, email, rsvp_status)'
    )
    .eq('token_hash', hashInviteToken(token))
    .eq('purpose', purpose)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, reason: 'invalid' };
  if (data.revoked_at || new Date(data.expires_at) <= now)
    return { ok: false, reason: 'expired' };

  const guest = Array.isArray(data.calendar_event_guests)
    ? data.calendar_event_guests[0]
    : data.calendar_event_guests;
  if (!guest) return { ok: false, reason: 'invalid' };

  // The latest snapshot sent to this guest is what they already saw.
  const [{ data: delivery }, { data: settings }] = await Promise.all([
    sbAdmin
      .from('calendar_invite_deliveries')
      .select('event_snapshot')
      .eq('guest_id', guest.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sbAdmin
      .from('calendar_event_invitation_settings')
      .select('organizer_user_id, cancelled_at')
      .eq('event_id', guest.event_id)
      .maybeSingle(),
  ]);
  if (purpose === 'rsvp' && settings?.cancelled_at)
    return { ok: false, reason: 'expired' };
  const snapshot = InvitationSnapshotSchema.safeParse(delivery?.event_snapshot);

  return {
    ok: true,
    tokenId: data.id,
    guest,
    event: snapshot.success
      ? {
          title: snapshot.data.title,
          start: snapshot.data.start,
          end: snapshot.data.end,
          organizer:
            snapshot.data.organizer.name || snapshot.data.organizer.email,
        }
      : null,
    organizerUserId: snapshot.success
      ? snapshot.data.organizer.userId
      : (settings?.organizer_user_id ?? null),
  };
}

export async function applyRsvp(
  sbAdmin: TypedSupabaseClient,
  lookup: Extract<TokenLookup, { ok: true }>,
  response: RsvpResponse
) {
  const now = new Date().toISOString();
  const { error } = await sbAdmin
    .from('calendar_event_guests')
    .update({ rsvp_status: response, responded_at: now })
    .eq('id', lookup.guest.id);
  if (error) throw error;
  await Promise.all([
    sbAdmin
      .from('calendar_invite_tokens')
      .update({ last_used_at: now })
      .eq('id', lookup.tokenId),
    sbAdmin.from('calendar_invite_audit').insert({
      ws_id: lookup.guest.ws_id,
      event_id: lookup.guest.event_id,
      guest_id: lookup.guest.id,
      action: 'rsvp',
      detail: { status: response, channel: 'email_link' },
    }),
  ]);
}

export async function applyUnsubscribe(
  sbAdmin: TypedSupabaseClient,
  lookup: Extract<TokenLookup, { ok: true }>,
  scope: 'all' | 'sender'
) {
  const senderScoped = scope === 'sender' && lookup.organizerUserId;
  // Insert-only; a repeat unsubscribe hits the unique index (23505).
  const { error } = await sbAdmin.from('calendar_invite_suppressions').insert({
    email: lookup.guest.email,
    scope: senderScoped ? 'sender' : 'all',
    sender_user_id: senderScoped ? lookup.organizerUserId : null,
    source: 'recipient',
  });
  if (error && error.code !== '23505') throw error;
  const now = new Date().toISOString();
  await Promise.all([
    sbAdmin
      .from('calendar_invite_tokens')
      .update({ last_used_at: now })
      .eq('id', lookup.tokenId),
    sbAdmin.from('calendar_invite_audit').insert({
      ws_id: lookup.guest.ws_id,
      event_id: lookup.guest.event_id,
      guest_id: lookup.guest.id,
      action: senderScoped ? 'block_sender' : 'unsubscribe',
      detail: { channel: 'email_link' },
    }),
  ]);
  return senderScoped ? 'sender' : 'all';
}
