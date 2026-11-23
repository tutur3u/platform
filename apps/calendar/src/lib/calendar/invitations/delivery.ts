import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types';
import { InvitationError } from './context';
import { buildInvitationEmail, type InvitationLocale } from './email';
import { buildInvitationIcs, rsvpStatusToPartStat } from './ics';
import {
  attendeesVisibleTo,
  deliveryIdempotencyKey,
  type InvitationKind,
  type InvitationSnapshot,
  InvitationSnapshotSchema,
} from './snapshot';
import {
  createInviteToken,
  type InviteTokenPurpose,
  inviteTokenExpiry,
} from './tokens';

/** Bounds that keep one organizer or workspace from becoming a mass mailer. */
export const INVITATION_LIMITS = {
  userHourly: 60,
  userDaily: 200,
  workspaceDaily: 1000,
  /** Same event and recipient within this window counts towards the cap. */
  recipientWindowMs: 60 * 60 * 1000,
  recipientWindowMax: 5,
  dispatchBatch: 25,
  maxAttempts: 5,
} as const;

export type InvitationSendResult =
  | { status: 'sent'; messageId?: string }
  | { status: 'suppressed'; error: string }
  | { status: 'retry'; error: string }
  | { status: 'failed'; error: string }
  | { status: 'unknown'; error: string };

export interface InvitationMessage {
  wsId: string;
  requestedBy: string | null;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  ics: string;
  method: 'REQUEST' | 'CANCEL';
  unsubscribeUrl: string | null;
  deliveryId: string;
}

export interface InvitationDeliveryDeps {
  sbAdmin: TypedSupabaseClient;
  send: (message: InvitationMessage) => Promise<InvitationSendResult>;
  /** Public Calendar base URL, e.g. https://tuturuuu.com/calendar */
  linkBase: string;
  locale: InvitationLocale;
  now?: () => Date;
}

export interface QueueSummary {
  queued: number;
  suppressed: number;
  throttled: number;
  duplicates: number;
}

async function audit(
  sbAdmin: TypedSupabaseClient,
  rows: Array<{
    ws_id: string;
    event_id: string | null;
    guest_id: string | null;
    actor_user_id: string | null;
    action: string;
    detail?: Record<string, Json>;
  }>
) {
  if (!rows.length) return;
  const { error } = await sbAdmin
    .schema('private')
    .from('calendar_invite_audit')
    .insert(rows.map((row) => ({ ...row, detail: row.detail ?? {} })));
  if (error)
    console.error('Calendar invitation audit write failed', error.code);
}

async function suppressedEmails(
  sbAdmin: TypedSupabaseClient,
  input: { wsId: string; senderUserId: string | null; emails: string[] }
) {
  if (!input.emails.length) return new Set<string>();
  const { data, error } = await sbAdmin
    .schema('private')
    .from('calendar_invite_suppressions')
    .select('email, scope, sender_user_id, ws_id')
    .in('email', input.emails);
  if (error) throw error;
  return new Set(
    (data ?? [])
      .filter(
        (row) =>
          row.scope === 'all' ||
          (row.scope === 'workspace' && row.ws_id === input.wsId) ||
          (row.scope === 'sender' &&
            input.senderUserId !== null &&
            row.sender_user_id === input.senderUserId)
      )
      .map((row) => row.email)
  );
}

async function recentlyContacted(
  sbAdmin: TypedSupabaseClient,
  input: { eventId: string; emails: string[]; since: Date }
) {
  if (!input.emails.length) return new Map<string, number>();
  const { data, error } = await sbAdmin
    .schema('private')
    .from('calendar_invite_deliveries')
    .select('recipient_email')
    .eq('event_id', input.eventId)
    .in('recipient_email', input.emails)
    .in('status', ['queued', 'sending', 'sent', 'failed', 'unknown'])
    .gte('created_at', input.since.toISOString());
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? [])
    counts.set(row.recipient_email, (counts.get(row.recipient_email) ?? 0) + 1);
  return counts;
}

/**
 * Queue invitation, update or cancellation emails for a set of guests. The
 * caller has already authorised the actor and bumped the sequence for
 * updates and cancellations. Every message is built from `snapshot`.
 */
export async function queueInvitationDeliveries(
  deps: Pick<InvitationDeliveryDeps, 'sbAdmin' | 'now'>,
  input: {
    snapshot: InvitationSnapshot;
    kind: InvitationKind;
    actorUserId: string;
    recipients: Array<{ guestId: string; email: string }>;
  }
): Promise<QueueSummary> {
  const { sbAdmin } = deps;
  const now = deps.now?.() ?? new Date();
  const { snapshot, kind, actorUserId } = input;
  const recipients = input.recipients.filter(
    (recipient) => recipient.email !== snapshot.organizer.email
  );
  const summary: QueueSummary = {
    queued: 0,
    suppressed: 0,
    throttled: 0,
    duplicates: 0,
  };
  if (!recipients.length) return summary;

  const emails = recipients.map((recipient) => recipient.email);
  const [suppressed, recent] = await Promise.all([
    suppressedEmails(sbAdmin, {
      wsId: snapshot.wsId,
      senderUserId: snapshot.organizer.userId,
      emails,
    }),
    recentlyContacted(sbAdmin, {
      eventId: snapshot.eventId,
      emails,
      since: new Date(now.getTime() - INVITATION_LIMITS.recipientWindowMs),
    }),
  ]);

  const classified = recipients.map((recipient) => {
    if (suppressed.has(recipient.email))
      return { ...recipient, status: 'suppressed' as const };
    if (
      kind !== 'cancel' &&
      (recent.get(recipient.email) ?? 0) >= INVITATION_LIMITS.recipientWindowMax
    )
      return { ...recipient, status: 'throttled' as const };
    return { ...recipient, status: 'queued' as const };
  });

  const sendable = classified.filter((row) => row.status === 'queued').length;
  const rows = classified.map((row) => ({
    event_id: snapshot.eventId,
    guest_id: row.guestId,
    recipient_email: row.email,
    method: kind === 'cancel' ? 'CANCEL' : 'REQUEST',
    kind,
    ical_sequence: snapshot.sequence,
    idempotency_key: deliveryIdempotencyKey({
      eventId: snapshot.eventId,
      recipientEmail: row.email,
      sequence: snapshot.sequence,
      kind,
    }),
    event_snapshot: snapshot,
    status: row.status,
  }));

  const { data: enqueued, error } = await sbAdmin
    .schema('private')
    .rpc('calendar_invite_enqueue', {
      p_ws_id: snapshot.wsId,
      p_requested_by: actorUserId,
      p_rows: rows as unknown as Json,
      // Cancellations only tell existing guests; they never widen reach.
      p_new_recipients: kind === 'cancel' ? 0 : sendable,
      p_check_quota: sendable > 0,
      p_user_hourly_limit: INVITATION_LIMITS.userHourly,
      p_user_daily_limit: INVITATION_LIMITS.userDaily,
      p_workspace_daily_limit: INVITATION_LIMITS.workspaceDaily,
    });
  if (error) throw error;
  const result = enqueued as unknown as {
    blocked: string | null;
    rows: Array<{ id: string; guest_id: string | null; status: string }>;
  };
  const blocked = result.blocked;
  if (blocked) {
    await audit(sbAdmin, [
      {
        ws_id: snapshot.wsId,
        event_id: snapshot.eventId,
        guest_id: null,
        actor_user_id: actorUserId,
        action:
          blocked === 'stopped'
            ? 'invite_blocked_fence'
            : 'invite_blocked_quota',
        detail: { reason: blocked, recipients: sendable, kind },
      },
    ]);
    throw new InvitationError(
      blocked === 'stopped'
        ? 'Invitation email is paused for this workspace'
        : 'Invitation sending limit reached. Try again later',
      429,
      blocked === 'stopped' ? 'invitations_paused' : `quota_${blocked}`
    );
  }
  const inserted = result.rows;

  for (const row of inserted ?? []) {
    if (row.status === 'queued') summary.queued += 1;
    else if (row.status === 'suppressed') summary.suppressed += 1;
    else if (row.status === 'throttled') summary.throttled += 1;
  }
  summary.duplicates = rows.length - (inserted?.length ?? 0);

  await audit(
    sbAdmin,
    (inserted ?? []).map((row) => ({
      ws_id: snapshot.wsId,
      event_id: snapshot.eventId,
      guest_id: row.guest_id,
      actor_user_id: actorUserId,
      action:
        row.status === 'queued'
          ? 'invite_queued'
          : row.status === 'suppressed'
            ? 'invite_suppressed'
            : 'invite_throttled',
      detail: { kind, sequence: snapshot.sequence },
    }))
  );

  return summary;
}

async function mintToken(
  sbAdmin: TypedSupabaseClient,
  recipient: {
    guestId: string | null;
    email: string;
    wsId: string;
    senderUserId: string | null;
  },
  purpose: InviteTokenPurpose,
  eventEnd: Date,
  now: Date
) {
  const { token, tokenHash } = createInviteToken();
  const { error } = await sbAdmin
    .schema('private')
    .from('calendar_invite_tokens')
    .insert({
      guest_id: recipient.guestId,
      email: recipient.email,
      ws_id: recipient.wsId,
      sender_user_id: recipient.senderUserId,
      purpose,
      token_hash: tokenHash,
      expires_at: inviteTokenExpiry(purpose, eventEnd, now).toISOString(),
    });
  if (error) throw error;
  return token;
}

function retryDelayMs(attempts: number) {
  return Math.min(60, 2 ** attempts) * 60 * 1000;
}

/**
 * Claim and send a bounded batch of due deliveries. Safe to call from any
 * request: claims are leased and skip rows another worker holds, attempts
 * are capped, and a send fence stops claiming entirely.
 */
export async function dispatchInvitationDeliveries(
  deps: InvitationDeliveryDeps,
  input: { limit?: number } = {}
) {
  const { sbAdmin } = deps;
  const now = deps.now?.() ?? new Date();
  const { data: claimed, error } = await sbAdmin
    .schema('private')
    .rpc('calendar_invite_claim_deliveries', {
      p_limit: Math.min(input.limit ?? INVITATION_LIMITS.dispatchBatch, 100),
      p_lease_seconds: 120,
    });
  if (error) throw error;

  const results = { sent: 0, failed: 0, retrying: 0, suppressed: 0 };
  for (const delivery of claimed ?? []) {
    const parsed = InvitationSnapshotSchema.safeParse(delivery.event_snapshot);
    const finish = async (
      patch: Record<string, unknown>,
      action: string,
      detail: Record<string, Json> = {}
    ) => {
      // Encrypted events keep no plaintext copy once a row is settled.
      const settled = !(
        patch.status === 'failed' && patch.next_attempt_at !== 'infinity'
      );
      const encrypted =
        (delivery.event_snapshot as { encrypted?: unknown } | null)
          ?.encrypted === true;
      await sbAdmin
        .schema('private')
        .from('calendar_invite_deliveries')
        .update({
          ...patch,
          ...(settled && encrypted ? { event_snapshot: {} } : {}),
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', delivery.id)
        .eq('status', 'sending');
      await audit(sbAdmin, [
        {
          ws_id: delivery.ws_id,
          event_id: delivery.event_id,
          guest_id: delivery.guest_id,
          actor_user_id: delivery.requested_by,
          action,
          detail: {
            kind: delivery.kind,
            attempt: delivery.attempts,
            ...detail,
          },
        },
      ]);
    };

    if (!parsed.success) {
      results.failed += 1;
      await finish(
        {
          status: 'failed',
          last_error: 'invalid snapshot',
          next_attempt_at: 'infinity',
        },
        'invite_failed'
      );
      continue;
    }

    const snapshot = parsed.data;
    // Honour an unsubscribe that arrived after this row was queued.
    const suppressedNow = await suppressedEmails(sbAdmin, {
      wsId: delivery.ws_id,
      senderUserId: snapshot.organizer.userId,
      emails: [delivery.recipient_email],
    });
    if (suppressedNow.size > 0) {
      results.suppressed += 1;
      await finish(
        { status: 'suppressed', last_error: 'recipient suppressed' },
        'invite_suppressed'
      );
      continue;
    }
    const eventEnd = new Date(snapshot.end);
    try {
      const recipient = {
        guestId: delivery.guest_id,
        email: delivery.recipient_email,
        wsId: delivery.ws_id,
        senderUserId: snapshot.organizer.userId,
      };
      const rsvpToken =
        delivery.guest_id && delivery.kind !== 'cancel'
          ? await mintToken(sbAdmin, recipient, 'rsvp', eventEnd, now)
          : null;
      // Every message, including a cancellation sent after its guest row is
      // gone, carries a working unsubscribe link.
      const unsubscribeToken = await mintToken(
        sbAdmin,
        recipient,
        'unsubscribe',
        eventEnd,
        now
      );
      const base = deps.linkBase.replace(/\/$/, '');
      const unsubscribeUrl = unsubscribeToken
        ? `${base}/api/v1/calendar/invitations/unsubscribe?token=${unsubscribeToken}`
        : null;
      const attendees = attendeesVisibleTo(snapshot, delivery.recipient_email);
      const email = buildInvitationEmail({
        snapshot,
        kind: delivery.kind as InvitationKind,
        locale: deps.locale,
        recipientEmail: delivery.recipient_email,
        attendees,
        links: {
          rsvpUrl: rsvpToken
            ? `${base}/api/v1/calendar/invitations/rsvp?token=${rsvpToken}`
            : null,
          unsubscribeUrl,
          blockSenderUrl: unsubscribeUrl
            ? `${unsubscribeUrl}&scope=sender`
            : null,
        },
      });
      const ics = buildInvitationIcs({
        uid: snapshot.uid,
        sequence: snapshot.sequence,
        method: delivery.method as 'REQUEST' | 'CANCEL',
        summary: snapshot.title,
        description: snapshot.description,
        location: snapshot.location,
        conferenceUrl: snapshot.conferenceUrl,
        start: new Date(snapshot.start),
        end: eventEnd,
        allDay: snapshot.allDay,
        organizer: {
          email: snapshot.organizer.email,
          name: snapshot.organizer.name,
        },
        attendees: attendees.map((attendee) => ({
          email: attendee.email,
          name: attendee.name,
          optional: attendee.optional,
          partStat: rsvpStatusToPartStat(attendee.status),
        })),
        stamp: now,
      });

      const result = await deps.send({
        wsId: delivery.ws_id,
        requestedBy: delivery.requested_by,
        to: delivery.recipient_email,
        replyTo: snapshot.organizer.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        ics,
        method: delivery.method as 'REQUEST' | 'CANCEL',
        unsubscribeUrl,
        deliveryId: delivery.id,
      });

      if (result.status === 'sent') {
        results.sent += 1;
        await finish(
          {
            status: 'sent',
            sent_at: new Date().toISOString(),
            provider_message_id: result.messageId?.slice(0, 500) ?? null,
            last_error: null,
          },
          'invite_sent'
        );
        if (delivery.guest_id && delivery.kind !== 'cancel')
          await sbAdmin
            .schema('private')
            .from('calendar_event_guests')
            .update({ last_invited_sequence: delivery.ical_sequence })
            .eq('id', delivery.guest_id);
      } else if (result.status === 'suppressed') {
        results.suppressed += 1;
        await finish(
          { status: 'suppressed', last_error: result.error.slice(0, 500) },
          'invite_suppressed'
        );
      } else if (result.status === 'unknown') {
        // Never resend after an ambiguous provider outcome.
        results.failed += 1;
        await finish(
          { status: 'unknown', last_error: result.error.slice(0, 500) },
          'invite_failed',
          { outcome: 'unknown' }
        );
      } else if (
        result.status === 'retry' &&
        delivery.attempts < INVITATION_LIMITS.maxAttempts
      ) {
        results.retrying += 1;
        await finish(
          {
            status: 'failed',
            last_error: result.error.slice(0, 500),
            next_attempt_at: new Date(
              now.getTime() + retryDelayMs(delivery.attempts)
            ).toISOString(),
          },
          'invite_failed',
          { retry: true }
        );
      } else {
        results.failed += 1;
        await finish(
          {
            status: 'failed',
            last_error: result.error.slice(0, 500),
            next_attempt_at: 'infinity',
          },
          'invite_failed'
        );
      }
    } catch (dispatchError) {
      // The lease expires and the next claim settles the row as unknown, so a
      // message that may have gone out is never sent twice.
      console.error('Calendar invitation dispatch error', {
        deliveryId: delivery.id,
        error:
          dispatchError instanceof Error
            ? dispatchError.message.slice(0, 200)
            : 'unknown',
      });
      results.failed += 1;
    }
  }
  return results;
}
