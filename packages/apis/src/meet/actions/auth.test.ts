import {
  hashLegacyPassword,
  hashPassword,
  verifyPassword,
} from '@tuturuuu/utils/crypto';
import { verifyMeetGuestSession } from '@tuturuuu/utils/meet-guest-session';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PLAN_ID = '0b6f8a52-3c1e-4f7a-9d2b-5e8c7a6b4d3f';
const COMPACT_PLAN_ID = PLAN_ID.replaceAll('-', '');

const mocks = vi.hoisted(() => {
  type Call = {
    filters: Array<[string, unknown]>;
    operation: 'insert' | 'select' | 'update';
    payload?: unknown;
    table: string;
  };
  const calls: Call[] = [];
  const responses: Record<string, unknown[]> = {};

  const from = vi.fn((table: string) => {
    const call: Call = { filters: [], operation: 'select', table };
    calls.push(call);
    const respond = () =>
      Promise.resolve(
        responses[`${table}:${call.operation}`]?.shift() ?? {
          data: null,
          error: null,
        }
      );
    const builder: Record<string, unknown> & PromiseLike<unknown> = {
      eq: vi.fn((column: string, value: unknown) => {
        call.filters.push([column, value]);
        return builder;
      }),
      insert: vi.fn((payload: unknown) => {
        call.operation = 'insert';
        call.payload = payload;
        return builder;
      }),
      maybeSingle: vi.fn(respond),
      select: vi.fn(() => builder),
      single: vi.fn(respond),
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally thenable.
      then: (onFulfilled, onRejected) =>
        respond().then(onFulfilled, onRejected),
      update: vi.fn((payload: unknown) => {
        call.operation = 'update';
        call.payload = payload;
        return builder;
      }),
    };
    return builder;
  });

  return {
    calls,
    createAdminClient: vi.fn(async () => ({ from })),
    queue(key: string, response: unknown) {
      responses[key] = [...(responses[key] ?? []), response];
    },
    reset() {
      calls.length = 0;
      for (const key of Object.keys(responses)) delete responses[key];
    },
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

const mutations = () => mocks.calls.filter((c) => c.operation !== 'select');

describe('Meet guest login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reset();
  });

  it('creates a guest with a scrypt hash and returns a session, not the hash', async () => {
    mocks.queue('meet_together_guests:select', { data: null, error: null });
    mocks.queue('meet_together_guests:insert', {
      data: { id: 'guest-1', name: 'Ann' },
      error: null,
    });
    const { guestLogin } = await import('./auth.js');

    const result = await guestLogin(COMPACT_PLAN_ID, {
      name: 'Ann',
      password: 'correct horse',
    });

    const insert = mutations()[0];
    const payload = insert?.payload as {
      password_hash: string;
      password_salt: string;
      plan_id: string;
    };
    expect(payload.plan_id).toBe(PLAN_ID);
    expect(payload.password_hash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(payload.password_salt).toBe('');
    expect(
      (
        await verifyPassword('correct horse', {
          hash: payload.password_hash,
        })
      ).valid
    ).toBe(true);

    const user = result.data?.user;
    expect(user).toMatchObject({ id: 'guest-1', is_guest: true });
    expect(user).not.toHaveProperty('password_hash');
    expect(JSON.stringify(result)).not.toContain(payload.password_hash);
    expect(verifyMeetGuestSession(user?.guest_session, PLAN_ID)).toEqual({
      guestId: 'guest-1',
    });
    expect(
      verifyMeetGuestSession(user?.guest_session, 'another-plan')
    ).toBeNull();
  });

  it('upgrades a legacy hash with a guarded update on successful login', async () => {
    const legacyHash = hashLegacyPassword('secret', 'abc123');
    mocks.queue('meet_together_guests:select', {
      data: {
        id: 'guest-1',
        name: 'Ann',
        password_hash: legacyHash,
        password_salt: 'abc123',
      },
      error: null,
    });
    const { guestLogin } = await import('./auth.js');

    const result = await guestLogin(PLAN_ID, {
      name: 'Ann',
      password: 'secret',
    });

    expect(result.data?.message).toBe('Logged in');
    const [update] = mutations();
    expect(update).toMatchObject({
      operation: 'update',
      table: 'meet_together_guests',
    });
    expect(update?.filters).toEqual([
      ['id', 'guest-1'],
      ['password_hash', legacyHash],
    ]);
    const payload = update?.payload as { password_hash: string };
    expect(payload.password_hash).toMatch(/^scrypt\$/);
    expect(
      (await verifyPassword('secret', { hash: payload.password_hash })).valid
    ).toBe(true);
  });

  it('rejects a wrong password for a legacy guest without writing', async () => {
    mocks.queue('meet_together_guests:select', {
      data: {
        id: 'guest-1',
        name: 'Ann',
        password_hash: hashLegacyPassword('secret', 'abc123'),
        password_salt: 'abc123',
      },
      error: null,
    });
    const { guestLogin } = await import('./auth.js');

    const result = await guestLogin(PLAN_ID, { name: 'Ann', password: 'nope' });

    expect(result).toEqual({ error: 'Invalid credentials' });
    expect(mutations()).toEqual([]);
  });

  it('logs in a scrypt guest without rehashing', async () => {
    mocks.queue('meet_together_guests:select', {
      data: {
        id: 'guest-1',
        name: 'Ann',
        password_hash: await hashPassword('secret'),
        password_salt: '',
      },
      error: null,
    });
    const { guestLogin } = await import('./auth.js');

    const result = await guestLogin(PLAN_ID, {
      name: 'Ann',
      password: 'secret',
    });

    expect(result.data?.user.id).toBe('guest-1');
    expect(mutations()).toEqual([]);
  });

  it('rejects the stored hash presented as the password', async () => {
    const storedHash = await hashPassword('secret');
    const legacyHash = hashLegacyPassword('secret', 'abc123');
    mocks.queue('meet_together_guests:select', {
      data: {
        id: 'guest-1',
        name: 'Ann',
        password_hash: storedHash,
        password_salt: '',
      },
      error: null,
    });
    mocks.queue('meet_together_guests:select', {
      data: {
        id: 'guest-2',
        name: 'Bob',
        password_hash: legacyHash,
        password_salt: 'abc123',
      },
      error: null,
    });
    const { guestLogin } = await import('./auth.js');

    expect(
      await guestLogin(PLAN_ID, { name: 'Ann', password: storedHash })
    ).toEqual({ error: 'Invalid credentials' });
    expect(
      await guestLogin(PLAN_ID, { name: 'Bob', password: legacyHash })
    ).toEqual({ error: 'Invalid credentials' });
    expect(mutations()).toEqual([]);
  });

  it('rejects malformed plan ids and oversized passwords before querying', async () => {
    const { guestLogin } = await import('./auth.js');

    expect(
      await guestLogin('not-a-plan', { name: 'Ann', password: 'x' })
    ).toEqual({ error: 'Invalid request' });
    expect(
      await guestLogin(PLAN_ID, { name: 'Ann', password: 'x'.repeat(1025) })
    ).toEqual({ error: 'Invalid request' });
    expect(mocks.calls).toEqual([]);
  });
});
