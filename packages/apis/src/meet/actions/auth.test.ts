import { scryptSync } from 'node:crypto';
import { hashPassword, verifyPassword } from '@tuturuuu/utils/crypto';
import { verifyMeetGuestSession } from '@tuturuuu/utils/meet-guest-session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const LEGACY_HASH =
  '7a37b85c8918eac19a9089c0fa5a2ab4dce3f90528dcdeec108b23ddf3607b99';

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
    getPlan: vi.fn(),
    createAdminClient: vi.fn(async () => ({ from })),
    queue(key: string, response: { data: unknown; error: unknown }) {
      if (key === 'meet_together_guests:select') {
        key = 'meet_together_plans:select';
        response = {
          data: {
            id: 'existing-plan',
            meet_together_guests: response.data ? [response.data] : [],
          },
          error: response.error,
        };
      }
      responses[key] = [...(responses[key] ?? []), response];
    },
    reset() {
      calls.length = 0;
      for (const key of Object.keys(responses)) delete responses[key];
    },
  };
});

vi.mock('@tuturuuu/utils/plan-helpers', () => ({ getPlan: mocks.getPlan }));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

const limits = vi.hoisted(() => ({
  check: vi.fn(),
  refund: vi.fn(),
}));

vi.mock(
  '@tuturuuu/utils/abuse-protection/password-attempt-limits',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@tuturuuu/utils/abuse-protection/password-attempt-limits')
    >()),
    checkPasswordAttemptLimit: (...args: unknown[]) => limits.check(...args),
  })
);

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'cf-connecting-ip': '203.0.113.9' }),
}));

const mutations = () => mocks.calls.filter((c) => c.operation !== 'select');

describe('Meet guest login', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Client IP headers are trusted only behind a configured proxy (#6554).
    vi.stubEnv('TRUSTED_PROXY', 'cloudflare');
    mocks.reset();
    mocks.getPlan.mockResolvedValue({
      id: PLAN_ID,
      is_public: true,
      ws_id: null,
    });
    limits.check.mockResolvedValue({ allowed: true, refund: limits.refund });
  });

  it.each(['private personal plan', 'workspace plan'])(
    'denies guest login to an inaccessible %s before guest lookup or writes',
    async () => {
      mocks.getPlan.mockResolvedValue(null);
      mocks.queue('meet_together_guests:select', { data: null, error: null });
      mocks.queue('meet_together_guests:insert', {
        data: { id: 'guest-1', name: 'Ann' },
        error: null,
      });
      const { guestLogin } = await import('./auth.js');
      expect(
        await guestLogin(PLAN_ID, { name: 'Ann', password: 'fixture' })
      ).toEqual({ error: 'Invalid request' });
      expect(mocks.getPlan).toHaveBeenCalledWith(PLAN_ID, {
        actorUserId: null,
      });
      expect(mocks.calls).toEqual([]);
    }
  );

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

  it('reserves the shared plan creation budget before hashing a new guest', async () => {
    limits.check.mockResolvedValue({ allowed: false, retryAfter: 420 });
    mocks.queue('meet_together_guests:select', { data: null, error: null });
    mocks.queue('meet_together_guests:insert', {
      data: { id: 'guest-new', name: 'Fresh name' },
      error: null,
    });
    const crypto = await import('@tuturuuu/utils/crypto');
    const hash = vi.spyOn(crypto, 'hashPassword');
    try {
      const { guestLogin } = await import('./auth.js');
      const result = await guestLogin(PLAN_ID, {
        name: 'Fresh name',
        password: 'secret',
      });
      expect(result).toEqual({
        error: 'Too many attempts to join',
        limitType: 'join',
        retryAfter: 420,
      });
      expect(limits.check).toHaveBeenCalledWith({
        scope: 'meet-guest-create',
        target: PLAN_ID,
        ip: '203.0.113.9',
      });
      expect(hash).not.toHaveBeenCalled();
      expect(mutations()).toEqual([]);
    } finally {
      hash.mockRestore();
    }
  });

  it('upgrades older scrypt parameters with a guarded update on successful login', async () => {
    const salt = Buffer.alloc(16, 1);
    const key = scryptSync('secret', salt, 32, { N: 16384, r: 8, p: 1 });
    const legacyHash = `scrypt$16384$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
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

  it.each([LEGACY_HASH, '1d455debda48eb', 'scrypt$malformed'])(
    'requires a creator reset for guest hash %s without writing or issuing a session',
    async (hash) => {
      mocks.queue('meet_together_guests:select', {
        data: {
          id: 'guest-1',
          name: 'Ann',
          password_hash: hash,
          password_salt: 'abc123',
        },
        error: null,
      });
      const { guestLogin } = await import('./auth.js');

      const result = await guestLogin(PLAN_ID, {
        name: 'Ann',
        password: 'nope',
      });

      expect(result).toMatchObject({ code: 'PASSWORD_RESET_REQUIRED' });
      expect(result).not.toHaveProperty('data');
      expect(mutations()).toEqual([]);
      expect(limits.refund).not.toHaveBeenCalled();
      expect(limits.check).not.toHaveBeenCalled();
    }
  );

  it('refuses to verify once the failure budget is spent', async () => {
    limits.check.mockResolvedValue({ allowed: false, retryAfter: 420 });
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
      name: ' ANN ',
      password: 'secret',
    });

    expect(result).toEqual({
      error: 'Too many failed attempts',
      limitType: 'password',
      retryAfter: 420,
    });
    expect(limits.check).toHaveBeenCalledWith(
      expect.objectContaining({ target: `${PLAN_ID}:ann` })
    );
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
    expect(limits.refund).toHaveBeenCalledOnce();
    expect(mutations()).toEqual([]);
  });

  it('rejects the stored hash presented as the password', async () => {
    const storedHash = await hashPassword('secret');
    const legacyHash = LEGACY_HASH;
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
    ).toMatchObject({ code: 'PASSWORD_RESET_REQUIRED' });
    expect(mutations()).toEqual([]);
  });

  it('does no reservation or hashing for a nonexistent plan', async () => {
    mocks.queue('meet_together_plans:select', { data: null, error: null });
    mocks.queue('meet_together_guests:insert', {
      data: { id: 'unexpected', name: 'Ann' },
      error: null,
    });
    const crypto = await import('@tuturuuu/utils/crypto');
    const hash = vi.spyOn(crypto, 'hashPassword');
    try {
      const { guestLogin } = await import('./auth.js');
      const result = await guestLogin(PLAN_ID, {
        name: 'Ann',
        password: 'secret',
      });
      expect(hash).not.toHaveBeenCalled();
      expect(limits.check).not.toHaveBeenCalled();
      expect(result).toEqual({ error: 'Invalid request' });
      expect(mutations()).toEqual([]);
    } finally {
      hash.mockRestore();
    }
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
