import { randomUUID } from 'node:crypto';
import { switchStoredAccount } from './switch-stored-account';
import {
  createAdminClient,
  clearAccountSwitchSession,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseSession } from '@tuturuuu/supabase/next/user';
import { revokeUserAiTempAuthTokens } from '@tuturuuu/utils/ai-temp-auth';
import { revokeCurrentUserSignOutCredentials } from '../sign-out-credentials';
import {
  createDeviceSecret,
  decryptSession,
  encryptSession,
  hashDeviceSecret,
  resolveMultiAccountSecret,
} from './crypto';
import {
  clearDeviceCookie,
  getDeviceCredentialCandidates,
  setDeviceCookie,
} from './device-cookies';
import {
  getWorkspaceIdFromMultiAccountRoute,
  normalizePersistableMultiAccountRoute,
  resolveMultiAccountAddRedirect,
} from './routes';
import {
  MAX_WEB_ACCOUNT_SESSIONS,
  type SaveCurrentAccountPayload,
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

interface CanonicalProfile {
  avatar_url: string | null;
  display_name: string | null;
}

async function readCanonicalProfiles(userIds: string[]) {
  const uniqueIds = [...new Set(userIds)];
  const profiles = new Map<string, CanonicalProfile>();

  if (uniqueIds.length === 0) {
    return profiles;
  }

  try {
    const admin = await createAdminClient({ noCookie: true });
    const { data, error } = await admin
      .from('users')
      .select('id, display_name, avatar_url')
      .in('id', uniqueIds);

    if (error || !data) {
      return profiles;
    }

    for (const row of data) {
      profiles.set(row.id, {
        avatar_url: row.avatar_url,
        display_name: row.display_name,
      });
    }
  } catch {
    return profiles;
  }

  return profiles;
}

function profileFields(
  profile: CanonicalProfile | undefined,
  fallback: { avatarUrl: string | null; displayName: string | null }
) {
  if (!profile) {
    return {
      avatar_url: fallback.avatarUrl,
      display_name: fallback.displayName,
    };
  }

  const displayName = profile.display_name?.trim();

  return {
    avatar_url: profile.avatar_url,
    display_name: displayName ? displayName : fallback.displayName,
  };
}

function applyCanonicalProfile(
  summary: WebAccountSummary,
  profile: CanonicalProfile | undefined
): WebAccountSummary {
  const fields = profileFields(profile, {
    avatarUrl: summary.metadata.avatarUrl,
    displayName: summary.metadata.displayName,
  });

  return {
    ...summary,
    metadata: {
      ...summary.metadata,
      avatarUrl: fields.avatar_url,
      displayName: fields.display_name,
    },
  };
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

async function resolveDevice(
  request: Pick<Request, 'headers' | 'url'>,
  options: { create: boolean; touch?: boolean }
): Promise<WebAccountDevice | null> {
  if (!resolveMultiAccountSecret()) return null;

  const credentials = await getDeviceCredentialCandidates(request);
  if (credentials.length === 0 && !options.create) return null;
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
      // last_seen_at doubles as the switch compare-and-set version, so a
      // read-only render must not bump it under a concurrent switch.
      if (options.touch !== false) {
        await db
          .from('web_account_devices')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', credential.deviceId);
      }
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

  const rows: AccountRow[] = data ?? [];
  return rows.filter((row) =>
    decryptSession(row.session_ciphertext, row.user_id)
  );
}

async function listAccountsForDevice(
  device: WebAccountDevice | null
): Promise<WebAccountsResponse> {
  if (!device) {
    return { accounts: [], activeAccountId: null };
  }

  const rows = await getAccountRows(device.deviceId);
  const profiles = await readCanonicalProfiles(rows.map((row) => row.user_id));
  const accounts = rows.map((row) =>
    applyCanonicalProfile(rowToAccountSummary(row), profiles.get(row.user_id))
  );
  const activeAccountExists = accounts.some(
    (account) => account.id === device.activeUserId
  );

  return {
    accounts,
    activeAccountId: activeAccountExists ? device.activeUserId : null,
  };
}

/**
 * Read-only listing for server-rendered pages: it never touches the device
 * row, so rendering cannot race an account switch's compare-and-set.
 */
export async function peekWebAccounts(
  request: Pick<Request, 'headers' | 'url'>
): Promise<WebAccountsResponse> {
  const device = await resolveDevice(request, { create: false, touch: false });
  return listAccountsForDevice(device);
}

export async function listWebAccounts(
  request: Pick<Request, 'headers' | 'url'>
): Promise<WebAccountsResponse> {
  const device = await resolveDevice(request, { create: false });
  return listAccountsForDevice(device);
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
): Promise<{ accountId: string } | { limit: true }> {
  const db = await getPrivateDb();
  const userId = session.user.id;
  const accounts = await getAccountRows(deviceId);
  const existing = accounts.find((row) => row.user_id === userId);
  const route =
    normalizePersistableMultiAccountRoute(payload.route, request, null) ??
    normalizePersistableMultiAccountRoute(payload.returnUrl, request, null) ??
    existing?.last_route ??
    '/';
  const workspaceId = getWorkspaceIdFromRoute(route);

  if (!existing && accounts.length >= MAX_WEB_ACCOUNT_SESSIONS) {
    return { limit: true };
  }

  const now = new Date().toISOString();
  const profiles = await readCanonicalProfiles([userId]);
  const identity = profileFields(profiles.get(userId), {
    avatarUrl: getSessionAvatarUrl(session),
    displayName: getSessionDisplayName(session),
  });

  await db.from('web_account_sessions').upsert(
    {
      avatar_url: identity.avatar_url,
      device_id: deviceId,
      display_name: identity.display_name,
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

  return { accountId: userId };
}

export async function saveCurrentWebAccount(
  request: Request,
  payload: SaveCurrentAccountPayload = {}
): Promise<WebAccountMutationResponse> {
  if (!resolveMultiAccountSecret()) return unavailableDevice();

  const supabase = await createClient(request);
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    return {
      ...(await listAccountsForDevice(null)),
      error: 'session_missing',
      errorCode: 'session_missing',
      success: false,
    };
  }

  const device = await resolveDevice(request, { create: true });

  if (!device) return unavailableDevice();

  const saved = await upsertStoredSession(
    request,
    device.deviceId,
    session,
    payload
  );

  if ('limit' in saved) {
    return {
      ...(await listAccountsForDevice(device)),
      error: 'account_limit',
      errorCode: 'account_limit',
      success: false,
    };
  }

  const accountId = saved.accountId;
  const accounts = await listAccountsForDevice({
    ...device,
    activeUserId: accountId,
  });

  return {
    ...accounts,
    accountId,
    redirectTo: resolveMultiAccountAddRedirect(payload.returnUrl, request),
    success: true,
  };
}

function unavailableDevice(): WebAccountMutationResponse {
  return {
    accounts: [],
    activeAccountId: null,
    error: 'device_unavailable',
    errorCode: 'device_unavailable',
    success: false,
  };
}

async function switchToStoredWebAccount(
  request: Request,
  device: WebAccountDevice,
  accountId: string,
  payload: SwitchAccountPayload = {}
): Promise<WebAccountMutationResponse> {
  const profile = (await readCanonicalProfiles([accountId])).get(accountId);

  return switchStoredAccount({
    request,
    device,
    accountId,
    payload,
    listAccounts: listAccountsForDevice,
    resolveIdentity: (fallback) => profileFields(profile, fallback),
    revokeTempAuth: async (userId) => {
      await revokeUserAiTempAuthTokens(userId);
    },
  });
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
      requiresReauth: true,
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

  const accounts = await listAccountsForDevice(device);
  if (!accounts.activeAccountId) return accounts;

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

  const accounts = await listAccountsForDevice(device);
  if (!accounts.accounts.some((account) => account.id === accountId)) {
    return { ...accounts, success: true };
  }

  return removeAccountForDevice(request, device, accountId);
}

async function removeAccountForDevice(
  request: Request,
  device: WebAccountDevice,
  accountId: string
): Promise<WebAccountMutationResponse> {
  const db = await getPrivateDb();
  const removed = await db
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

  const failClosed = async (result: WebAccountMutationResponse) => {
    await clearAccountSwitchSession(request);
    try {
      await updateDeviceActiveUser(device.deviceId, null);
    } catch {
      /* Browser sign-out remains effective if bookkeeping is unavailable. */
    }
    return { ...result, activeAccountId: null, redirectTo: '/login' };
  };
  const failure: WebAccountMutationResponse = {
    accounts: [],
    activeAccountId: null,
    success: false,
    errorCode: 'switch_conflict',
    error: 'Account switch state changed',
  };
  if (removed.error) return failClosed(failure);
  try {
    const remaining = await getAccountRows(device.deviceId);
    const nextAccount = remaining.find((row) => row.user_id !== accountId);
    if (nextAccount) {
      const switched = await switchToStoredWebAccount(
        request,
        device,
        nextAccount.user_id
      );
      return switched.success ? switched : failClosed(switched);
    }
  } catch {
    return failClosed(failure);
  }

  const supabase = await createClient(request);
  await revokeCurrentUserSignOutCredentials(supabase);
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
  if (device?.activeUserId) {
    const rows = await getAccountRows(device.deviceId).catch(() => []);
    if (rows.some((row) => row.user_id === device.activeUserId)) {
      return removeAccountForDevice(request, device, device.activeUserId);
    }
  }

  const supabase = await createClient(request);
  await revokeCurrentUserSignOutCredentials(supabase);
  await supabase.auth.signOut({ scope: 'local' });
  return {
    ...(await listAccountsForDevice(device)),
    redirectTo: '/login',
    success: true,
  };
}

export async function logoutAllWebAccounts(
  request: Request
): Promise<WebAccountMutationResponse> {
  const device = await resolveDevice(request, { create: false });
  const supabase = await createClient(request);

  await revokeCurrentUserSignOutCredentials(supabase);
  await supabase.auth.signOut({ scope: 'local' });

  if (device) {
    const db = await getPrivateDb();
    await db.from('web_account_devices').delete().eq('id', device.deviceId);
  }
  await clearDeviceCookie(request);

  return {
    accounts: [],
    activeAccountId: null,
    redirectTo: '/login',
    success: true,
  };
}
