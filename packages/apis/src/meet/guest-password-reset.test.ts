import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { hashPassword, verifyPassword } from '@tuturuuu/utils/crypto';
import { createMeetGuestSession } from '@tuturuuu/utils/meet-guest-session';
import { expect, it } from 'vitest';
import { resetMeetGuestPassword } from './guest-password-reset';
import { resolveMeetGuestFromSession } from './guest-session';

const planId = '00000000-0000-4000-8000-000000000001';
const guestId = '00000000-0000-4000-8000-000000000002';
const legacy =
  '7a37b85c8918eac19a9089c0fa5a2ab4dce3f90528dcdeec108b23ddf3607b99';

function fixture() {
  const guest = {
    id: guestId,
    name: 'Ann',
    plan_id: planId,
    password_hash: legacy,
    password_salt: 'salt',
  };
  const state = {
    owner: 'owner',
    raced: false,
    error: false,
    wsId: null as string | null,
    membership: 'MEMBER' as string | null,
    membershipError: false,
  };
  const writes: {
    table: string;
    values: Record<string, unknown>;
    filters: [string, unknown][];
  }[] = [];
  const queries: { table: string; filters: [string, unknown][] }[] = [];
  const client = {
    from(table: string) {
      const filters: [string, unknown][] = [];
      queries.push({ table, filters });
      let values: Record<string, unknown> | undefined;
      const builder = {
        select: () => builder,
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        update(next: Record<string, unknown>) {
          values = next;
          return builder;
        },
        async maybeSingle() {
          if (state.error) return { data: null, error: { message: 'fixture' } };
          if (table === 'meet_together_plans')
            return {
              data: { creator_id: state.owner, ws_id: state.wsId },
              error: null,
            };
          if (table === 'workspace_members')
            return {
              data: state.membership ? { type: state.membership } : null,
              error: state.membershipError
                ? { message: 'membership fixture' }
                : null,
            };
          if (values && state.raced) return { data: null, error: null };
          const row: Record<string, unknown> = guest;
          if (filters.some(([key, value]) => row[key] !== value))
            return { data: null, error: null };
          if (values) {
            writes.push({ table, values, filters });
            Object.assign(guest, values);
          }
          return { data: { ...guest }, error: null };
        },
      };
      return builder;
    },
  } as unknown as TypedSupabaseClient;
  const reset = (
    actorUserId: string | null = 'owner',
    input: unknown = { planId, guestName: 'Ann', password: 'new password' }
  ) => resetMeetGuestPassword({ client, actorUserId, input });
  return { guest, state, writes, queries, client, reset };
}

it('lets the verified plan creator replace only the held guest credential, preserving identity', async () => {
  const f = fixture();
  expect(await f.reset()).toEqual({ data: { success: true } });
  expect(f.writes).toHaveLength(1);
  expect(f.writes[0]).toMatchObject({
    table: 'meet_together_guests',
    filters: [
      ['plan_id', planId],
      ['id', guestId],
      ['password_hash', legacy],
    ],
  });
  expect(f.writes[0]?.values).not.toHaveProperty('password');
  expect(f.guest.id).toBe(guestId);
  expect(f.guest.password_salt).toBe('');
  expect(
    (await verifyPassword('new password', { hash: f.guest.password_hash }))
      .valid
  ).toBe(true);
  expect(
    (await verifyPassword('password', { hash: f.guest.password_hash })).valid
  ).toBe(false);
  expect(f.writes.map((write) => write.table)).toEqual([
    'meet_together_guests',
  ]);
});

it.each([null, 'other-user'])(
  'denies reset by actor %s without a write',
  async (actor) => {
    const f = fixture();
    expect(await f.reset(actor)).toMatchObject({
      error: actor ? 'FORBIDDEN' : 'UNAUTHORIZED',
    });
    expect(f.writes).toEqual([]);
    expect(f.guest.password_hash).toBe(legacy);
  }
);

it('does not reset a guest from a different plan', async () => {
  const f = fixture();
  f.guest.plan_id = 'another-plan';
  expect(await f.reset()).toEqual({ error: 'RESET_NOT_REQUIRED' });
  expect(f.writes).toEqual([]);
});

it('does not expand creator recovery to an existing scrypt credential', async () => {
  const f = fixture();
  f.guest.password_hash = await hashPassword('already current');
  expect(await f.reset()).toEqual({ error: 'RESET_NOT_REQUIRED' });
  expect(f.writes).toEqual([]);
});

it('preserves a concurrently changed credential and reports failure', async () => {
  const f = fixture();
  f.state.raced = true;
  expect(await f.reset()).toEqual({ error: 'RESET_FAILED' });
  expect(f.writes).toEqual([]);
  expect(f.guest.password_hash).toBe(legacy);
});

it('fails closed on lookup failure or malformed input before changing a password', async () => {
  const f = fixture();
  expect(
    await f.reset('owner', { planId, guestName: 'Ann', password: '' })
  ).toEqual({
    error: 'INVALID_REQUEST',
  });
  expect(f.queries).toEqual([]);
  f.state.error = true;
  expect(await f.reset()).toEqual({ error: 'RESET_FAILED' });
  expect(f.writes).toEqual([]);
});

it('rejects guest session mutations while the backing row requires reset, then accepts a current row', async () => {
  const f = fixture();
  const token = createMeetGuestSession({ guestId, planId }).token;
  expect(await resolveMeetGuestFromSession(f.client, planId, token)).toBeNull();
  f.guest.password_hash = await hashPassword('current');
  expect(await resolveMeetGuestFromSession(f.client, planId, token)).toEqual({
    id: guestId,
  });
});

it.each([null, 'GUEST'])(
  'denies a workspace plan creator with membership %s before reading guest credentials',
  async (membership) => {
    const f = fixture();
    f.state.wsId = 'workspace';
    f.state.membership = membership;
    expect(await f.reset()).toEqual({ error: 'FORBIDDEN' });
    expect(
      f.queries.some((query) => query.table === 'meet_together_guests')
    ).toBe(false);
    expect(f.writes).toEqual([]);
  }
);
it('checks workspace membership against the verified actor, not the guest', async () => {
  const f = fixture();
  f.state.wsId = 'workspace';
  expect(await f.reset()).toEqual({ data: { success: true } });
  expect(
    f.queries.find((query) => query.table === 'workspace_members')?.filters
  ).toEqual([
    ['ws_id', 'workspace'],
    ['user_id', 'owner'],
  ]);
});
it('treats a workspace membership lookup failure as failure, not authorization', async () => {
  const f = fixture();
  f.state.wsId = 'workspace';
  f.state.membershipError = true;
  expect(await f.reset()).toEqual({ error: 'RESET_FAILED' });
  expect(
    f.queries.some((query) => query.table === 'meet_together_guests')
  ).toBe(false);
  expect(f.writes).toEqual([]);
});
