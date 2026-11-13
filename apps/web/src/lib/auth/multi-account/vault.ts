import { randomUUID } from 'node:crypto';
import { switchStoredAccount } from './switch-stored-account';
import {
  createAdminClient,
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
  options: { create: boolean }
): Promise<WebAccountDevice | null> {
  const credentials = await getDeviceCredentialCandidates(request);
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
): Promise<{ accountId: string } | { limit: true }> {
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
      return { limit: true };
    }
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

  if (!device) {
    return {
      ...(await listAccountsForDevice(null)),
      error: 'device_unavailable',
      errorCode: 'device_unavailable',
      success: false,
    };
  }

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
  if (!(await getStoredSession(device.deviceId, accountId))) {
    return {
      ...(await listAccountsForDevice(device)),
      error: 'Account not found',
      requiresReauth: true,
      success: false,
    } as WebAccountMutationResponse & { error: string };
  }
  const profile = (await readCanonicalProfiles([accountId])).get(accountId);

  return switchStoredAccount({
    request,
    device,
    accountId,
    payload,
    listAccounts: listAccountsForDevice,
    resolveIdentity: (fallback) => profileFields(profile, fallback),
    revokeTempAuth: revokeCurrentUserTempAuth,
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

  if (!device?.activeUserId) {
    const supabase = await createClient(request);
    await revokeCurrentUserSignOutCredentials(supabase);
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

  await revokeCurrentUserSignOutCredentials(supabase);
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
