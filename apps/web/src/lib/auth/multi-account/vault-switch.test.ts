import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Exercises the account-switch path against an in-memory stand-in for the
 * `private` schema, so the vault's own bookkeeping is under test rather than
 * mocked away (the route-level tests in `src/__tests__` mock the vault wholesale).
 */

interface DeviceRow {
  active_user_id: string | null;
  id: string;
  last_seen_at?: string;
  revoked_at: string | null;
  secret_hash: string;
}

interface SessionRow {
  avatar_url: string | null;
  created_at: string;
  device_id: string;
  display_name: string | null;
  email: string | null;
  last_active_at: string | null;
  last_route: string | null;
  last_workspace_id: string | null;
  session_ciphertext: string;
  session_expires_at?: string | null;
  updated_at?: string;
  user_id: string;
}

type Row = Record<string, unknown>;

const store: { devices: DeviceRow[]; sessions: SessionRow[] } = {
  devices: [],
  sessions: [],
};

const TABLES: Record<string, () => Row[]> = {
  web_account_devices: () => store.devices as unknown as Row[],
  web_account_sessions: () => store.sessions as unknown as Row[],
};

/** Just enough of the postgrest builder for the calls the vault makes. */
class FakeQuery implements PromiseLike<{ count?: number; error: null }> {
  private readonly rows: Row[];
  private readonly filters: Array<[string, unknown]> = [];
  private mode: 'delete' | 'insert' | 'select' | 'update' | 'upsert' = 'select';
  private payload: Row | null = null;
  private headOnly = false;

  constructor(table: string) {
    const rows = TABLES[table];

    if (!rows) {
      throw new Error(`Unexpected table: ${table}`);
    }

    this.rows = rows();
  }

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    this.headOnly = Boolean(options?.head);
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  order() {
    return this;
  }

  update(values: Row) {
    this.mode = 'update';
    this.payload = values;
    return this;
  }

  upsert(values: Row) {
    this.mode = 'upsert';
    this.payload = values;
    return this;
  }

  insert(values: Row) {
    this.mode = 'insert';
    this.payload = values;
    return this;
  }

  delete() {
    this.mode = 'delete';
    return this;
  }

  maybeSingle() {
    return Promise.resolve({ data: this.matches()[0] ?? null, error: null });
  }

  // Postgrest builders are thenables: `await db.from(t).update(v).eq(...)` is
  // how the vault writes, so the stand-in must be awaitable mid-chain too.
  // biome-ignore lint/suspicious/noThenProperty: deliberately a thenable
  then<TResult1, TResult2 = never>(
    onFulfilled?:
      | ((value: {
          count?: number;
          error: null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }

  private matches() {
    return this.rows.filter((row) =>
      this.filters.every(([column, value]) => row[column] === value)
    );
  }

  private run() {
    if (this.mode === 'update' && this.payload) {
      for (const row of this.matches()) {
        Object.assign(row, this.payload);
      }
    }

    if (this.mode === 'insert' && this.payload) {
      this.rows.push({ ...this.payload });
    }

    if (this.mode === 'upsert' && this.payload) {
      const key = (row: Row) =>
        `${row.device_id as string}:${row.user_id as string}`;
      const existing = this.rows.find(
        (row) => key(row) === key(this.payload as Row)
      );

      if (existing) {
        Object.assign(existing, this.payload);
      } else {
        this.rows.push({ created_at: NOW, ...this.payload });
      }
    }

    if (this.mode === 'delete') {
      for (const row of this.matches()) {
        this.rows.splice(this.rows.indexOf(row), 1);
      }
    }

    const matched = this.mode === 'select' ? this.matches() : [];

    return {
      count: this.headOnly ? matched.length : undefined,
      data: this.headOnly ? null : matched,
      error: null,
    };
  }
}

const NOW = '2026-07-26T00:00:00.000Z';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  setSession: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'device-cookie' ? { value: 'device-1.secret-1' } : undefined,
      set: vi.fn(),
    }),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () =>
    Promise.resolve({
      schema: () => ({ from: (table: string) => new FakeQuery(table) }),
    }),
  createClient: () => Promise.resolve({ auth }),
}));

vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  revokeUserAiTempAuthTokens: vi.fn(),
}));

vi.mock('./crypto', () => ({
  createDeviceCookieValue: (deviceId: string, secret: string) =>
    `${deviceId}.${secret}`,
  createDeviceSecret: () => 'secret-new',
  decryptSession: (ciphertext: string) => JSON.parse(ciphertext),
  encryptSession: (session: unknown) => JSON.stringify(session),
  getAllDeviceCookieClearTargets: () => [],
  getDeviceCookieName: () => 'device-cookie',
  getDeviceCookieOptions: () => ({}),
  getDeviceCookieReadNames: () => ['device-cookie'],
  getStaleDeviceCookieClearTargets: () => [],
  hashDeviceSecret: (secret: string) => `hashed:${secret}`,
  parseDeviceCookieValue: (value: string | undefined) => {
    if (!value) return null;
    const [deviceId, secret] = value.split('.');
    return deviceId && secret ? { deviceId, secret } : null;
  },
}));

function session(userId: string, refreshToken: string) {
  return {
    access_token: `access-${refreshToken}`,
    expires_at: 1_800_000_000,
    refresh_token: refreshToken,
    user: { email: `${userId}@example.com`, id: userId, user_metadata: {} },
  };
}

function sessionRow(userId: string, refreshToken: string): SessionRow {
  return {
    avatar_url: null,
    created_at: NOW,
    device_id: 'device-1',
    display_name: userId,
    email: `${userId}@example.com`,
    last_active_at: NOW,
    last_route: `/${userId}-workspace`,
    last_workspace_id: `${userId}-workspace`,
    session_ciphertext: JSON.stringify(session(userId, refreshToken)),
    user_id: userId,
  };
}

function storedRefreshToken(userId: string) {
  const row = store.sessions.find((entry) => entry.user_id === userId);
  return row
    ? (JSON.parse(row.session_ciphertext).refresh_token as string)
    : null;
}

function request() {
  return new Request('https://tuturuuu.localhost/login?returnUrl=x', {
    headers: { cookie: 'device-cookie=device-1.secret-1' },
  });
}

describe('switchWebAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.devices = [
      {
        active_user_id: 'user-a',
        id: 'device-1',
        revoked_at: null,
        secret_hash: 'hashed:secret-1',
      },
    ];
    store.sessions = [
      sessionRow('user-a', 'refresh-a-stored'),
      sessionRow('user-b', 'refresh-b-stored'),
    ];
    auth.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
  });

  // Regression: the vault wrote an account's session when it was added and then
  // only when it was switched *to*, never when it was switched away from. Supabase
  // rotates the refresh token on every refresh, so the copy for whoever was
  // signed in went stale within the hour; switching back then failed and deleted
  // the row, and the retry reported "Account not found".
  it('captures the outgoing account live session before handing over', async () => {
    // The browser has refreshed user A several times since the row was written.
    auth.getSession.mockResolvedValue({
      data: { session: session('user-a', 'refresh-a-rotated') },
    });
    auth.setSession.mockResolvedValue({
      data: { session: session('user-b', 'refresh-b-fresh') },
      error: null,
    });

    const { switchWebAccount } = await import('./vault');
    const result = await switchWebAccount(request(), 'user-b');

    expect(result.success).toBe(true);
    expect(storedRefreshToken('user-a')).toBe('refresh-a-rotated');
    // And the account we moved to keeps whatever Supabase just handed back.
    expect(storedRefreshToken('user-b')).toBe('refresh-b-fresh');
  });

  it('switches using the stored tokens of the target account', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: session('user-a', 'refresh-a-rotated') },
    });
    auth.setSession.mockResolvedValue({
      data: { session: session('user-b', 'refresh-b-fresh') },
      error: null,
    });

    const { switchWebAccount } = await import('./vault');
    await switchWebAccount(request(), 'user-b');

    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: 'access-refresh-b-stored',
      refresh_token: 'refresh-b-stored',
    });
    expect(
      store.devices.find((device) => device.id === 'device-1')?.active_user_id
    ).toBe('user-b');
  });

  it('leaves the signed-in account alone when its session is not the active one', async () => {
    // A mismatch means the cookie no longer belongs to the account the device
    // thinks is active; overwriting the row would hand out the wrong session.
    auth.getSession.mockResolvedValue({
      data: { session: session('user-c', 'refresh-c') },
    });
    auth.setSession.mockResolvedValue({
      data: { session: session('user-b', 'refresh-b-fresh') },
      error: null,
    });

    const { switchWebAccount } = await import('./vault');
    await switchWebAccount(request(), 'user-b');

    expect(storedRefreshToken('user-a')).toBe('refresh-a-stored');
  });

  it('flags a dead stored session as needing a fresh sign-in', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: session('user-a', 'refresh-a-rotated') },
    });
    auth.setSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid Refresh Token' },
    });

    const { switchWebAccount } = await import('./vault');
    const result = await switchWebAccount(request(), 'user-b');

    expect(result).toMatchObject({
      error: 'Invalid Refresh Token',
      requiresReauth: true,
      success: false,
    });
    // The unusable row is dropped, and the response the client re-renders from
    // no longer lists it — so a retry cannot report it as merely missing.
    expect(storedRefreshToken('user-b')).toBeNull();
    expect(result.accounts.map((account) => account.id)).toEqual(['user-a']);
  });

  it('reports an unknown account as needing a fresh sign-in too', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: session('user-a', 'refresh-a-rotated') },
    });

    const { switchWebAccount } = await import('./vault');
    const result = await switchWebAccount(request(), 'user-z');

    expect(result).toMatchObject({
      error: 'Account not found',
      requiresReauth: true,
      success: false,
    });
    expect(auth.setSession).not.toHaveBeenCalled();
  });
});
