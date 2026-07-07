import { randomUUID } from 'node:crypto';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseSession } from '@tuturuuu/supabase/next/user';
import { revokeUserAiTempAuthTokens } from '@tuturuuu/utils/ai-temp-auth';
import { cookies } from 'next/headers';
import {
  createDeviceCookieValue,
  createDeviceSecret,
  decryptSession,
  encryptSession,
  getAllDeviceCookieClearTargets,
  getDeviceCookieName,
  getDeviceCookieOptions,
  getDeviceCookieReadNames,
  getStaleDeviceCookieClearTargets,
  hashDeviceSecret,
  parseDeviceCookieValue,
} from './crypto';
import {
  getWorkspaceIdFromMultiAccountRoute,
  normalizeMultiAccountRedirectPath,
  normalizePersistableMultiAccountRoute,
} from './routes';
import {
  MAX_WEB_ACCOUNT_SESSIONS,
  type SaveCurrentAccountPayload,
  type StoredWebAccountSession,
  type SwitchAccountPayload,
  type UpdateCurrentAccountPayload,
  type WebAccountDevice,
  type WebAccountMutationResponse,
  type WebAccountSummary,
  type WebAccountsResponse,
} from './types';

export { normalizeMultiAccountRedirectPath } from './routes';

type PrivateDb = ReturnType<
  Awaited<ReturnType<typeof createAdminClient>>['schema']
>;

interface DeviceRow {
  active_user_id: string | null;
  id: string;
  revoked_at: string | null;
  secret_hash: string;
}

interface AccountRow {
  avatar_url: string | null;
  created_at: string;
  display_name: string | null;
  email: string | null;
  last_active_at: string | null;
  last_route: string | null;
  last_workspace_id: string | null;
  session_ciphertext: string;
  user_id: string;
}

async function getPrivateDb() {
  return (await createAdminClient({ noCookie: true })).schema(
    'private'
  ) as PrivateDb;
}

function toTimestamp(value: string | null | undefined) {
  return value ? new Date(value).getTime() : null;
}

function getSessionExpiresAt(session: SupabaseSession) {
  return session.expires_at
    ? new Date(session.expires_at * 1000).toISOString()
    : null;
}

function getUserMetadataString(
  metadata: Record<string, unknown> | undefined,
  keys: string[]
) {
  for (const key of keys) {
    const value = metadata?.[key];

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getSessionDisplayName(session: SupabaseSession) {
  const metadata = session.user.user_metadata;

  return (
    getUserMetadataString(metadata, [
      'display_name',
      'full_name',
      'name',
      'preferred_username',
      'user_name',
    ]) ??
    session.user.email ??
    null
  );
}

function getSessionAvatarUrl(session: SupabaseSession) {
  return getUserMetadataString(session.user.user_metadata, [
    'avatar_url',
    'picture',
  ]);
}

function getWorkspaceIdFromRoute(route: string | null | undefined) {
  return getWorkspaceIdFromMultiAccountRoute(route);
}

function rowToAccountSummary(row: AccountRow): WebAccountSummary {
  return {
    email: row.email,
    id: row.user_id,
    metadata: {
      addedAt: toTimestamp(row.created_at),
      avatarUrl: row.avatar_url,
      displayName: row.display_name,
      lastActiveAt: toTimestamp(row.last_active_at),
      lastRoute: row.last_route,
      lastWorkspaceId: row.last_workspace_id,
    },
  };
}

function clearStaleDeviceCookies(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  request: Pick<Request, 'headers' | 'url'>
) {
  for (const target of getStaleDeviceCookieClearTargets(request)) {
    cookieStore.set(target.name, '', target.options);
  }
}

function getCookieHeaderValues(
  request: Pick<Request, 'headers' | 'url'>,
  name: string
) {
  const cookieHeader = request.headers.get('cookie');

  if (!cookieHeader) return [];

  return cookieHeader.split(';').flatMap((cookie) => {
    const [cookieName, ...valueParts] = cookie.trim().split('=');
    if (cookieName !== name) return [];
    const value = valueParts.join('=').trim();
    return value ? [value] : [];
  });
}

function getDeviceCredentialCandidates(
  request: Pick<Request, 'headers' | 'url'>,
  cookieStore: Awaited<ReturnType<typeof cookies>>
) {
  return getDeviceCookieReadNames(request).flatMap((cookieName) => {
    const headerValues = getCookieHeaderValues(request, cookieName);
    const values =
      headerValues.length > 0
        ? [...headerValues].reverse()
        : [cookieStore.get(cookieName)?.value].filter(Boolean);

    return values.flatMap((value) => {
      const credential = parseDeviceCookieValue(value);
      return credential ? [credential] : [];
    });
  });
}

async function setDeviceCookie(
  request: Pick<Request, 'headers' | 'url'>,
  device: WebAccountDevice
) {
  const cookieStore = await cookies();
  const cookieName = getDeviceCookieName(request);

  clearStaleDeviceCookies(cookieStore, request);

  cookieStore.set(
    cookieName,
    createDeviceCookieValue(device.deviceId, device.secret),
    getDeviceCookieOptions(request)
  );
}

async function clearDeviceCookie(request: Pick<Request, 'headers' | 'url'>) {
  const cookieStore = await cookies();
  for (const target of getAllDeviceCookieClearTargets(request)) {
    cookieStore.set(target.name, '', target.options);
  }
}

async function resolveDevice(
  request: Pick<Request, 'headers' | 'url'>,
  options: { create: boolean }
): Promise<WebAccountDevice | null> {
  const cookieStore = await cookies();
  const credentials = getDeviceCredentialCandidates(request, cookieStore);
  const db = await getPrivateDb();

  for (const credential of credentials) {
    const { data } = await db
      .from('web_account_devices')
      .select('id, secret_hash, active_user_id, revoked_at')
      .eq('id', credential.deviceId)
      .maybeSingle();
    const row = data as DeviceRow | null;

    if (
      row &&
      !row.revoked_at &&
      row.secret_hash === hashDeviceSecret(credential.secret)
    ) {
      await db
        .from('web_account_devices')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', credential.deviceId);
      return {
        activeUserId: row.active_user_id,
        deviceId: credential.deviceId,
        secret: credential.secret,
      };
    }
  }

  if (!options.create) {
    return null;
  }

  const device: WebAccountDevice = {
    activeUserId: null,
    deviceId: randomUUID(),
    secret: createDeviceSecret(),
  };

  await db.from('web_account_devices').insert({
    id: device.deviceId,
    secret_hash: hashDeviceSecret(device.secret),
  });
  await setDeviceCookie(request, device);

  return device;
}

async function getAccountRows(deviceId: string) {
  const db = await getPrivateDb();
  const { data, error } = await db
    .from('web_account_sessions')
    .select(
      'user_id, email, display_name, avatar_url, session_ciphertext, last_workspace_id, last_route, created_at, last_active_at'
    )
    .eq('device_id', deviceId)
    .order('last_active_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as AccountRow[];
}

async function listAccountsForDevice(
  device: WebAccountDevice | null
): Promise<WebAccountsResponse> {
  if (!device) {
    return { accounts: [], activeAccountId: null };
  }

  const rows = await getAccountRows(device.deviceId);
  const accounts = rows.map(rowToAccountSummary);
  const activeAccountExists = accounts.some(
    (account) => account.id === device.activeUserId
  );

  return {
    accounts,
    activeAccountId: activeAccountExists ? device.activeUserId : null,
  };
}

export async function listWebAccounts(
  request: Pick<Request, 'headers' | 'url'>
): Promise<WebAccountsResponse> {
  const device = await resolveDevice(request, { create: false });
  return listAccountsForDevice(device);
}

async function getStoredSession(deviceId: string, accountId: string) {
  const db = await getPrivateDb();
  const { data, error } = await db
    .from('web_account_sessions')
    .select(
      'user_id, email, display_name, avatar_url, session_ciphertext, last_workspace_id, last_route, created_at, last_active_at'
    )
    .eq('device_id', deviceId)
    .eq('user_id', accountId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const row = data as AccountRow | null;

  if (!row) {
    return null;
  }

  return {
    email: row.email,
    metadata: rowToAccountSummary(row).metadata,
    session: decryptSession(row.session_ciphertext),
    userId: row.user_id,
  } satisfies StoredWebAccountSession;
}

async function updateDeviceActiveUser(
  deviceId: string,
  activeUserId: string | null
) {
  const db = await getPrivateDb();
  await db
    .from('web_account_devices')
    .update({
      active_user_id: activeUserId,
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', deviceId);
}

async function upsertStoredSession(
  request: Pick<Request, 'url'>,
  deviceId: string,
  session: SupabaseSession,
  payload: SaveCurrentAccountPayload
) {
  const db = await getPrivateDb();
  const userId = session.user.id;
  const existing = await getStoredSession(deviceId, userId);
  const route =
    normalizePersistableMultiAccountRoute(payload.route, request, null) ??
    normalizePersistableMultiAccountRoute(payload.returnUrl, request, null) ??
    existing?.metadata.lastRoute ??
    '/';
  const workspaceId = getWorkspaceIdFromRoute(route);

  if (!existing) {
    const { count, error: countError } = await db
      .from('web_account_sessions')
      .select('user_id', { count: 'exact', head: true })
      .eq('device_id', deviceId);

    if (countError) {
      throw new Error(countError.message);
    }

    if ((count ?? 0) >= MAX_WEB_ACCOUNT_SESSIONS) {
      throw new Error('Maximum account limit reached');
    }
  }

  const now = new Date().toISOString();

  await db.from('web_account_sessions').upsert(
    {
      avatar_url: getSessionAvatarUrl(session),
      device_id: deviceId,
      display_name: getSessionDisplayName(session),
      email: session.user.email ?? null,
      last_active_at: now,
      last_route: route,
      last_workspace_id: workspaceId,
      session_ciphertext: encryptSession(session),
      session_expires_at: getSessionExpiresAt(session),
      updated_at: now,
      user_id: userId,
    },
    { onConflict: 'device_id,user_id' }
  );
  await updateDeviceActiveUser(deviceId, userId);

  return userId;
}

export async function saveCurrentWebAccount(
  request: Request,
  payload: SaveCurrentAccountPayload = {}
): Promise<WebAccountMutationResponse> {
  const supabase = await createClient(request);
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    return {
      ...(await listAccountsForDevice(null)),
      error: error?.message ?? 'Session not found',
      success: false,
    } as WebAccountMutationResponse & { error: string };
  }

  const device = await resolveDevice(request, { create: true });

  if (!device) {
    throw new Error('Failed to create account device');
  }

  const accountId = await upsertStoredSession(
    request,
    device.deviceId,
    session,
    payload
  );
  const accounts = await listAccountsForDevice({
    ...device,
    activeUserId: accountId,
  });

  return {
    ...accounts,
    accountId,
    redirectTo: normalizeMultiAccountRedirectPath(payload.returnUrl, request),
    success: true,
  };
}

async function revokeCurrentUserTempAuth(supabase: {
  auth: {
    getUser: () => Promise<{
      data: {
        user: { id: string } | null;
      };
    }>;
  };
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await revokeUserAiTempAuthTokens(user.id);
  }
}

async function switchToStoredWebAccount(
  request: Request,
  device: WebAccountDevice,
  accountId: string,
  payload: SwitchAccountPayload = {}
): Promise<WebAccountMutationResponse> {
  const stored = await getStoredSession(device.deviceId, accountId);

  if (!stored) {
    return {
      ...(await listAccountsForDevice(device)),
      error: 'Account not found',
      success: false,
    } as WebAccountMutationResponse & { error: string };
  }

  const db = await getPrivateDb();
  const supabase = await createClient(request);

  await revokeCurrentUserTempAuth(supabase);

  if (payload.currentRoute && device.activeUserId) {
    await updateCurrentWebAccount(request, {
      route: payload.currentRoute,
      workspaceId: getWorkspaceIdFromRoute(payload.currentRoute),
    });
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: stored.session.access_token,
    refresh_token: stored.session.refresh_token,
  });

  if (error || !data.session || data.session.user.id !== accountId) {
    await db
      .from('web_account_sessions')
      .delete()
      .eq('device_id', device.deviceId)
      .eq('user_id', accountId);

    return {
      ...(await listAccountsForDevice(device)),
      error: error?.message ?? 'Stored session is no longer valid',
      success: false,
    } as WebAccountMutationResponse & { error: string };
  }

  const now = new Date().toISOString();
  await db
    .from('web_account_sessions')
    .update({
      last_active_at: now,
      session_ciphertext: encryptSession(data.session),
      session_expires_at: getSessionExpiresAt(data.session),
      updated_at: now,
    })
    .eq('device_id', device.deviceId)
    .eq('user_id', accountId);
  await updateDeviceActiveUser(device.deviceId, accountId);

  const redirectTo =
    normalizePersistableMultiAccountRoute(
      payload.targetRoute ?? stored.metadata.lastRoute,
      request,
      '/'
    ) ?? '/';
  const accounts = await listAccountsForDevice({
    ...device,
    activeUserId: accountId,
  });

  return {
    ...accounts,
    accountId,
    redirectTo,
    success: true,
  };
}

export async function switchWebAccount(
  request: Request,
  accountId: string,
  payload: SwitchAccountPayload = {}
): Promise<WebAccountMutationResponse> {
  const device = await resolveDevice(request, { create: false });

  if (!device) {
    return {
      ...(await listAccountsForDevice(null)),
      error: 'No account device found',
      success: false,
    } as WebAccountMutationResponse & { error: string };
  }

  return switchToStoredWebAccount(request, device, accountId, payload);
}

export async function updateCurrentWebAccount(
  request: Pick<Request, 'headers' | 'url'>,
  payload: UpdateCurrentAccountPayload
): Promise<WebAccountsResponse> {
  const device = await resolveDevice(request, { create: false });

  if (!device?.activeUserId) {
    return listAccountsForDevice(device);
  }

  const route = normalizePersistableMultiAccountRoute(
    payload.route,
    request,
    null
  );
  const workspaceId = payload.workspaceId ?? getWorkspaceIdFromRoute(route);

  if (!route && !workspaceId) {
    return listAccountsForDevice(device);
  }

  const db = await getPrivateDb();
  const updates: {
    last_route?: string;
    last_workspace_id?: string | null;
    updated_at: string;
  } = {
    updated_at: new Date().toISOString(),
  };

  if (route) {
    updates.last_route = route;
    updates.last_workspace_id = workspaceId;
  } else {
    updates.last_workspace_id = workspaceId;
  }

  await db
    .from('web_account_sessions')
    .update(updates)
    .eq('device_id', device.deviceId)
    .eq('user_id', device.activeUserId);

  return listAccountsForDevice(device);
}

export async function removeWebAccount(
  request: Request,
  accountId: string
): Promise<WebAccountMutationResponse> {
  const device = await resolveDevice(request, { create: false });

  if (!device) {
    return {
      ...(await listAccountsForDevice(null)),
      redirectTo: '/login',
      success: true,
    };
  }

  const db = await getPrivateDb();
  await db
    .from('web_account_sessions')
    .delete()
    .eq('device_id', device.deviceId)
    .eq('user_id', accountId);

  if (device.activeUserId !== accountId) {
    return {
      ...(await listAccountsForDevice(device)),
      success: true,
    };
  }

  const remaining = await getAccountRows(device.deviceId);
  const nextAccount = remaining.find((row) => row.user_id !== accountId);

  if (nextAccount) {
    return switchToStoredWebAccount(request, device, nextAccount.user_id);
  }

  const supabase = await createClient(request);
  await revokeCurrentUserTempAuth(supabase);
  await supabase.auth.signOut({ scope: 'local' });
  await updateDeviceActiveUser(device.deviceId, null);

  return {
    ...(await listAccountsForDevice({ ...device, activeUserId: null })),
    redirectTo: '/login',
    success: true,
  };
}

export async function logoutCurrentWebAccount(
  request: Request
): Promise<WebAccountMutationResponse> {
  const device = await resolveDevice(request, { create: false });

  if (!device?.activeUserId) {
    const supabase = await createClient(request);
    await revokeCurrentUserTempAuth(supabase);
    await supabase.auth.signOut({ scope: 'local' });
    return {
      ...(await listAccountsForDevice(device)),
      redirectTo: '/login',
      success: true,
    };
  }

  return removeWebAccount(request, device.activeUserId);
}

export async function logoutAllWebAccounts(
  request: Request
): Promise<WebAccountMutationResponse> {
  const device = await resolveDevice(request, { create: false });
  const supabase = await createClient(request);

  await revokeCurrentUserTempAuth(supabase);
  await supabase.auth.signOut({ scope: 'local' });

  if (device) {
    const db = await getPrivateDb();
    await db.from('web_account_devices').delete().eq('id', device.deviceId);
    await clearDeviceCookie(request);
  }

  return {
    accounts: [],
    activeAccountId: null,
    redirectTo: '/login',
    success: true,
  };
}
