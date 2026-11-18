import 'server-only';
import { vi } from 'vitest';
import { BASE_URL } from '@/constants/common';

vi.mock('server-only', () => ({}));
vi.mock('@/constants/common', () => ({ BASE_URL: 'https://tuturuuu.com' }));

/**
 * Exercises the account-switch path against an in-memory stand-in for the
 * `private` schema, so the vault's own bookkeeping is under test rather than
 * mocked away (the route-level tests in `src/__tests__` mock the vault wholesale).
 */

type DeviceRow = {
  active_user_id: string | null;
  id: string;
  last_seen_at?: string;
  revoked_at: string | null;
  secret_hash: string;
};

type ProfileRow = {
  avatar_url: string | null;
  display_name: string | null;
  id: string;
};

type SessionRow = {
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
};

type Row = Record<string, unknown>;

export const store: {
  devices: DeviceRow[];
  profiles: ProfileRow[];
  sessions: SessionRow[];
  vaultConfigured: boolean;
} = {
  devices: [],
  profiles: [],
  sessions: [],
  vaultConfigured: true,
};

const TABLES: Record<string, () => Row[]> = {
  users: () => store.profiles,
  web_account_devices: () => store.devices,
  web_account_sessions: () => store.sessions,
};

/** Just enough of the postgrest builder for the calls the vault makes. */
class FakeQuery implements PromiseLike<{ count?: number; error: null }> {
  private readonly rows: Row[];
  private readonly filters: Array<[string, unknown]> = [];
  private readonly inclusions: Array<[string, readonly unknown[]]> = [];
  private mode: 'delete' | 'insert' | 'select' | 'update' | 'upsert' = 'select';
  private payload: Row | null = null;
  private headOnly = false;
  is(column: string, value: unknown) {
    return this.eq(column, value);
  }

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

  in(column: string, values: readonly unknown[]) {
    this.inclusions.push([column, values]);
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
    return this.rows.filter(
      (row) =>
        this.filters.every(([column, value]) => row[column] === value) &&
        this.inclusions.every(([column, values]) =>
          values.includes(row[column])
        )
    );
  }

  private run() {
    const affected = this.matches();
    if (this.mode === 'update' && this.payload) {
      for (const row of this.matches()) {
        Object.assign(row, this.payload);
      }
    }

    if (this.mode === 'insert' && this.payload) {
      this.rows.push({ ...this.payload });
    }

    if (this.mode === 'upsert' && this.payload) {
      const payload = this.payload;
      const key = (row: Row) =>
        `${String(row.device_id)}:${String(row.user_id)}`;
      const existing = this.rows.find((row) => key(row) === key(payload));

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

    const matched = this.mode === 'select' ? this.matches() : affected;

    return {
      count: this.headOnly ? matched.length : undefined,
      data: this.headOnly ? null : matched,
      error: null,
    };
  }
}

export const NOW = '2026-07-26T00:00:00.000Z';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  setSession: vi.fn(),
  signOut: vi.fn(),
}));
const encryptCalls = vi.hoisted(() => ({ n: 0 }));
const cookieWrites = vi.hoisted(() => new Array<string>());
const rpc = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'device-cookie' ? { value: 'device-1.secret-1' } : undefined,
      set: (name: string, value: string) => {
        cookieWrites.push(`${name}=${value}`);
      },
    }),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () =>
    Promise.resolve({
      from: (table: string) => new FakeQuery(table),
      schema: () => ({ from: (table: string) => new FakeQuery(table) }),
    }),
  createClient: () => Promise.resolve({ auth, rpc }),
  clearAccountSwitchSession: async () => {
    cookieWrites.push('signed-out');
  },
  createAccountSwitchAuth: () =>
    Promise.resolve({
      readOutgoing: () =>
        auth
          .getSession()
          .then(
            (result: {
              data: { session: ReturnType<typeof session> | null };
            }) => result.data.session
          ),
      refreshTarget: (tokens: unknown) => auth.setSession(tokens),
      commit: () => {
        cookieWrites.push('installed');
      },
    }),
}));

vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  revokeUserAiTempAuthTokens: vi.fn(),
}));

vi.mock('./crypto', () => ({
  createDeviceCookieValue: (deviceId: string, secret: string) =>
    `${deviceId}.${secret}`,
  createDeviceSecret: () => 'secret-new',
  decryptSession: (ciphertext: string, userId: string) => {
    if (!ciphertext.startsWith('v2.')) return null;
    try {
      const session = JSON.parse(ciphertext.slice(3));
      return session.user.id === userId ? session : null;
    } catch {
      return null;
    }
  },
  encryptSession: (session: unknown) => {
    encryptCalls.n += 1;
    return `v2.${JSON.stringify(session)}`;
  },
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
  resolveMultiAccountSecret: () => (store.vaultConfigured ? 'fixture' : null),
}));

export function session(userId: string, refreshToken: string) {
  return {
    access_token: `access-${refreshToken}`,
    expires_at: 1_800_000_000,
    refresh_token: refreshToken,
    user: { email: `${userId}@example.com`, id: userId, user_metadata: {} },
  };
}

export function sessionRow(userId: string, refreshToken: string): SessionRow {
  return {
    avatar_url: null,
    created_at: NOW,
    device_id: 'device-1',
    display_name: userId,
    email: `${userId}@example.com`,
    last_active_at: NOW,
    last_route: `/${userId}-workspace`,
    last_workspace_id: `${userId}-workspace`,
    session_ciphertext: `v2.${JSON.stringify(session(userId, refreshToken))}`,
    updated_at: NOW,
    user_id: userId,
  };
}

export function storedRefreshToken(userId: string) {
  const row = store.sessions.find((entry) => entry.user_id === userId);
  return row ? JSON.parse(row.session_ciphertext.slice(3)).refresh_token : null;
}

export function request(origin: string | null = new URL(BASE_URL).origin) {
  const headers = new Headers({ cookie: 'device-cookie=device-1.secret-1' });
  if (origin) headers.set('origin', origin);

  return new Request('https://tuturuuu.localhost/login?returnUrl=x', {
    headers,
  });
}

export { auth, encryptCalls, cookieWrites, rpc };
