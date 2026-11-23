import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { InvitationError } from './context';
import {
  dispatchInvitationDeliveries,
  type InvitationMessage,
  queueInvitationDeliveries,
} from './delivery';
import type { InvitationSnapshot } from './snapshot';

type Call = { table: string; op: string; args: unknown[] };
type Responder = (
  table: string,
  calls: Call[]
) => { data: unknown; error: unknown };

/** Minimal chainable Supabase stand-in that records every call. */
function fakeClient(responder: Responder, rpc: Record<string, unknown>) {
  const log: Call[][] = [];
  const client = {
    from(table: string) {
      const calls: Call[] = [];
      log.push(calls);
      const builder: Record<string, unknown> = {};
      for (const op of [
        'select',
        'insert',
        'upsert',
        'update',
        'delete',
        'eq',
        'in',
        'is',
        'gte',
        'order',
        'limit',
        'maybeSingle',
        'single',
      ])
        builder[op] = (...args: unknown[]) => {
          calls.push({ table, op, args });
          return builder;
        };
      builder.then = (resolve: (value: unknown) => void) =>
        resolve(responder(table, calls));
      return builder;
    },
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      const value = rpc[name];
      return {
        data:
          typeof value === 'function'
            ? (value as (input: Record<string, unknown>) => unknown)(args)
            : (value ?? null),
        error: null,
      };
    }),
  };
  Object.assign(client, { schema: () => client });
  return {
    client: client as unknown as TypedSupabaseClient,
    log,
    rpc: client.rpc,
  };
}

const snapshot: InvitationSnapshot = {
  v: 1,
  eventId: '00000000-0000-4000-8000-000000000001',
  wsId: '00000000-0000-4000-8000-000000000002',
  uid: 'uid@calendar.tuturuuu.com',
  sequence: 1,
  title: 'Sync',
  description: null,
  location: null,
  conferenceUrl: null,
  start: '2026-12-01T09:00:00.000Z',
  end: '2026-12-01T10:00:00.000Z',
  allDay: false,
  timeZone: null,
  organizer: {
    email: 'owner@example.com',
    name: 'Owner',
    userId: '00000000-0000-4000-8000-000000000003',
  },
  guestsCanSeeGuestList: true,
  attendees: [
    {
      email: 'owner@example.com',
      name: null,
      status: 'accepted',
      optional: false,
    },
    { email: 'a@example.com', name: null, status: 'pending', optional: false },
    { email: 'b@example.com', name: null, status: 'pending', optional: false },
    { email: 'c@example.com', name: null, status: 'pending', optional: false },
  ],
};

const recipients = [
  { guestId: 'g-owner', email: 'owner@example.com' },
  { guestId: 'g-a', email: 'a@example.com' },
  { guestId: 'g-b', email: 'b@example.com' },
  { guestId: 'g-c', email: 'c@example.com' },
];

describe('queueInvitationDeliveries', () => {
  it('skips the organizer, suppresses opted-out and throttles repeat recipients', async () => {
    let upserted: Array<Record<string, unknown>> = [];
    const { client, rpc } = fakeClient(
      (table, calls) => {
        if (table === 'calendar_invite_suppressions')
          return {
            data: [
              {
                email: 'b@example.com',
                scope: 'all',
                sender_user_id: null,
                ws_id: null,
              },
            ],
            error: null,
          };
        if (table === 'calendar_invite_deliveries')
          return {
            data: Array.from({ length: 5 }, () => ({
              recipient_email: 'c@example.com',
            })),
            error: null,
          };
        return { data: null, error: null };
      },
      {
        calendar_invite_enqueue: (args: Record<string, unknown>) => {
          upserted = args.p_rows as typeof upserted;
          return {
            blocked: null,
            rows: upserted.map((row, index) => ({
              id: `d${index}`,
              guest_id: row.guest_id,
              status: row.status,
            })),
          };
        },
      }
    );

    const summary = await queueInvitationDeliveries(
      { sbAdmin: client },
      { snapshot, kind: 'update', actorUserId: 'actor', recipients }
    );

    expect(summary).toEqual({
      queued: 1,
      suppressed: 1,
      throttled: 1,
      duplicates: 0,
    });
    expect(upserted.map((row) => [row.recipient_email, row.status])).toEqual([
      ['a@example.com', 'queued'],
      ['b@example.com', 'suppressed'],
      ['c@example.com', 'throttled'],
    ]);
    expect(upserted[0]?.idempotency_key).toBe(
      `cal-invite-v1:${snapshot.eventId}:a@example.com:1:update`
    );
    expect(rpc).toHaveBeenCalledWith(
      'calendar_invite_enqueue',
      expect.objectContaining({ p_new_recipients: 1, p_check_quota: true })
    );
  });

  it('refuses to queue when the quota or fence blocks the send', async () => {
    const { client } = fakeClient(() => ({ data: [], error: null }), {
      calendar_invite_enqueue: { blocked: 'stopped', rows: [] },
    });
    await expect(
      queueInvitationDeliveries(
        { sbAdmin: client },
        { snapshot, kind: 'invite', actorUserId: 'actor', recipients }
      )
    ).rejects.toMatchObject({
      status: 429,
      code: 'invitations_paused',
    } satisfies Partial<InvitationError>);
  });
});

describe('dispatchInvitationDeliveries', () => {
  const claimed = (attempts: number) => ({
    id: 'd1',
    ws_id: snapshot.wsId,
    event_id: snapshot.eventId,
    guest_id: 'g-a',
    recipient_email: 'a@example.com',
    method: 'REQUEST',
    kind: 'invite',
    ical_sequence: 1,
    attempts,
    requested_by: 'actor',
    event_snapshot: snapshot,
  });

  function run(
    result: Awaited<
      ReturnType<Parameters<typeof dispatchInvitationDeliveries>[0]['send']>
    >,
    attempts = 1,
    options: { suppressed?: boolean; encrypted?: boolean } = {}
  ) {
    const updates: Array<Record<string, unknown>> = [];
    const { client } = fakeClient(
      (table, calls) => {
        const update = calls.find((c) => c.op === 'update');
        if (table === 'calendar_invite_deliveries' && update)
          updates.push(update.args[0] as Record<string, unknown>);
        if (table === 'calendar_invite_suppressions' && options.suppressed)
          return {
            data: [
              {
                email: 'a@example.com',
                scope: 'all',
                sender_user_id: null,
                ws_id: null,
              },
            ],
            error: null,
          };
        return { data: null, error: null };
      },
      {
        calendar_invite_claim_deliveries: [
          {
            ...claimed(attempts),
            event_snapshot: {
              ...snapshot,
              encrypted: options.encrypted === true,
            },
          },
        ],
      }
    );
    const send = vi.fn(async (_message: InvitationMessage) => result);
    return {
      updates,
      send,
      promise: dispatchInvitationDeliveries({
        sbAdmin: client,
        send,
        linkBase: 'https://tuturuuu.com/calendar/',
        locale: 'en',
        now: () => new Date('2026-11-23T00:00:00Z'),
      }),
    };
  }

  it('sends a server-built message with an .ics and one-click links', async () => {
    const { send, updates, promise } = run({ status: 'sent', messageId: 'm1' });
    expect(await promise).toMatchObject({ sent: 1 });
    const message = send.mock.calls[0]?.[0];
    expect(message?.replyTo).toBe('owner@example.com');
    expect(message?.ics).toContain('METHOD:REQUEST');
    expect(message?.html).toMatch(
      /invitations\/rsvp\?token=[A-Za-z0-9_-]{43}&amp;response=accepted/
    );
    expect(message?.unsubscribeUrl).toMatch(
      /^https:\/\/tuturuuu\.com\/calendar\/api\/v1\/calendar\/invitations\/unsubscribe\?token=/
    );
    expect(updates[0]).toMatchObject({
      status: 'sent',
      provider_message_id: 'm1',
    });
  });

  it('backs off a retryable failure', async () => {
    const { updates, promise } = run(
      { status: 'retry', error: 'rate_limited' },
      1
    );
    expect(await promise).toMatchObject({ retrying: 1 });
    expect(updates[0]).toMatchObject({
      status: 'failed',
      next_attempt_at: '2026-11-23T00:02:00.000Z',
    });
  });

  it('stops retrying at the attempt cap', async () => {
    const { updates, promise } = run({ status: 'retry', error: 'x' }, 5);
    expect(await promise).toMatchObject({ failed: 1 });
    expect(updates[0]).toMatchObject({
      status: 'failed',
      next_attempt_at: 'infinity',
    });
  });

  it('never resends after an ambiguous provider outcome', async () => {
    const { updates, promise } = run({ status: 'unknown', error: 'timeout' });
    await promise;
    expect(updates[0]).toMatchObject({ status: 'unknown' });
  });

  it('honours an unsubscribe that arrived after queueing', async () => {
    const { send, updates, promise } = run({ status: 'sent' }, 1, {
      suppressed: true,
    });
    expect(await promise).toMatchObject({ suppressed: 1, sent: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ status: 'suppressed' });
  });

  it('drops the plaintext snapshot of an encrypted event once settled', async () => {
    const sent = run({ status: 'sent' }, 1, { encrypted: true });
    await sent.promise;
    expect(sent.updates[0]).toMatchObject({
      status: 'sent',
      event_snapshot: {},
    });

    const retry = run({ status: 'retry', error: 'x' }, 1, { encrypted: true });
    await retry.promise;
    expect(retry.updates[0]).not.toHaveProperty('event_snapshot');
  });
});
