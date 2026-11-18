import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  NOW,
  store,
  auth,
  session,
  sessionRow,
  request,
  cookieWrites,
  storedRefreshToken,
} from './vault-test-fixture';
import { switchWebAccount, logoutCurrentWebAccount } from './vault';

beforeEach(() => {
  vi.clearAllMocks();
  cookieWrites.length = 0;
  store.devices = [
    {
      id: 'device-1',
      active_user_id: 'user-a',
      secret_hash: 'hashed:secret-1',
      revoked_at: null,
      last_seen_at: NOW,
    },
  ];
  store.sessions = [sessionRow('user-a', 'a'), sessionRow('user-b', 'b')];
  store.profiles = [];
  auth.getSession.mockResolvedValue({
    data: { session: session('user-a', 'rotated-a') },
  });
  auth.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
  auth.signOut.mockResolvedValue({ error: null });
  auth.setSession.mockResolvedValue({
    data: { session: session('user-b', 'fresh-b') },
    error: null,
  });
});

it('has no direct database connection dependency in runtime switch paths', () => {
  for (const path of readdirSync(new URL('.', import.meta.url)).filter(
    (name) =>
      name.endsWith('.ts') &&
      !name.endsWith('.test.ts') &&
      !name.includes('fixture')
  )) {
    expect(readFileSync(new URL(path, import.meta.url), 'utf8')).not.toMatch(
      /getPlatformSql|platform-sql|from ['"]postgres['"]|switch-transaction/
    );
  }
});
it('concurrent switches have one winner and one conflict without installation', async () => {
  auth.getSession.mockResolvedValue({ data: { session: null } });
  let release = () => {};
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = 0;
  auth.setSession.mockImplementation(async () => {
    if (++entered === 2) release();
    await barrier;
    return { data: { session: session('user-b', 'fresh-b') }, error: null };
  });
  const results = await Promise.all([
    switchWebAccount(request(), 'user-b'),
    switchWebAccount(request(), 'user-b'),
  ]);
  expect(results.filter((r) => r.success)).toHaveLength(1);
  expect(results.find((r) => !r.success)).toMatchObject({
    errorCode: 'switch_conflict',
  });
  expect(cookieWrites).toEqual(['installed']);
});
it('revocation during refresh retains updated target but emits no cookies', async () => {
  auth.setSession.mockImplementation(async () => {
    store.devices[0]!.revoked_at = NOW;
    return { data: { session: session('user-b', 'fresh-b') }, error: null };
  });
  expect(await switchWebAccount(request(), 'user-b')).toMatchObject({
    success: false,
    errorCode: 'switch_conflict',
  });
  expect(cookieWrites).toEqual([]);
  expect(storedRefreshToken('user-b')).toBe('fresh-b');
});
it('removed target cannot be resurrected during refresh', async () => {
  auth.setSession.mockImplementation(async () => {
    store.sessions.splice(1, 1);
    return { data: { session: session('user-b', 'fresh-b') }, error: null };
  });
  expect(await switchWebAccount(request(), 'user-b')).toMatchObject({
    success: false,
    errorCode: 'switch_conflict',
  });
  expect(store.sessions.map((s) => s.user_id)).toEqual(['user-a']);
  expect(cookieWrites).toEqual([]);
});
it('rejects a provider identity mismatch without cookies or provider detail', async () => {
  auth.setSession.mockResolvedValue({
    data: { session: session('user-c', 'private-token') },
    error: null,
  });
  const result = await switchWebAccount(request(), 'user-b');
  expect(result.success).toBe(false);
  expect(JSON.stringify(result)).not.toContain('private-token');
  expect(cookieWrites).toEqual([]);
});
it('rejects a device secret mismatch before provider calls', async () => {
  store.devices[0]!.secret_hash = 'different';
  expect((await switchWebAccount(request(), 'user-b')).success).toBe(false);
  expect(auth.setSession).not.toHaveBeenCalled();
  expect(cookieWrites).toEqual([]);
});
it('active logout signs out when fallback loses CAS after removing active first', async () => {
  auth.setSession.mockImplementation(async () => {
    expect(store.sessions.map((s) => s.user_id)).toEqual(['user-b']);
    store.devices[0]!.revoked_at = NOW;
    return { data: { session: session('user-b', 'fresh') }, error: null };
  });
  expect(await logoutCurrentWebAccount(request())).toMatchObject({
    success: false,
    activeAccountId: null,
    redirectTo: '/login',
  });
  expect(auth.signOut).not.toHaveBeenCalled();
  expect(cookieWrites).toEqual(['signed-out']);
});

it('active logout preserves a successful fallback after deleting the active account', async () => {
  const result = await logoutCurrentWebAccount(request());
  expect(result).toMatchObject({
    success: true,
    accountId: 'user-b',
    activeAccountId: 'user-b',
  });
  expect(store.sessions.map((row) => row.user_id)).toEqual(['user-b']);
  expect(store.devices[0]?.active_user_id).toBe('user-b');
  expect(cookieWrites).toEqual(['installed']);
});
it('never exposes provider error details and retains the target for reauthentication', async () => {
  auth.setSession.mockResolvedValue({
    data: { session: null },
    error: { message: 'synthetic-private-token' },
  });
  const result = await switchWebAccount(request(), 'user-b');
  expect(result).toMatchObject({
    success: false,
    requiresReauth: true,
    error: 'Stored session is no longer valid',
  });
  expect(JSON.stringify(result)).not.toContain('synthetic-private-token');
  expect(store.sessions.map((row) => row.user_id)).toEqual([
    'user-a',
    'user-b',
  ]);
  expect(cookieWrites).toEqual([]);
});
it('switch storage adapter contains no insert, upsert or delete operation', () => {
  expect(
    readFileSync(new URL('switch-stored-account.ts', import.meta.url), 'utf8')
  ).not.toMatch(/\.(?:upsert|insert|delete)\s*\(/);
});
