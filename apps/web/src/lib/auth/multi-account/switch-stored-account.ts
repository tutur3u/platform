import 'server-only';
import {
  createAccountSwitchAuth,
  createAdminClient,
} from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import { BASE_URL } from '@/constants/common';
import { decryptSession, encryptSession, hashDeviceSecret } from './crypto';
import { getDeviceCredentialCandidates } from './device-cookies';
import {
  getWorkspaceIdFromMultiAccountRoute,
  isWebOriginRequest,
  normalizePersistableMultiAccountRoute,
  resolveMultiAccountSwitchRedirect,
} from './routes';
import type {
  SwitchAccountPayload,
  WebAccountDevice,
  WebAccountMutationResponse,
  WebAccountsResponse,
} from './types';

const deviceSchema = z.object({
  id: z.string(),
  active_user_id: z.string().nullable(),
  last_seen_at: z.string(),
  revoked_at: z.string().nullable(),
});
const targetSchema = z.object({
  device_id: z.string(),
  user_id: z.string(),
  updated_at: z.string(),
  session_ciphertext: z.string(),
  last_route: z.string().nullable(),
  avatar_url: z.string().nullable(),
  display_name: z.string().nullable(),
});
function advanceVersion(observed: string) {
  const value = Date.parse(observed);
  if (!Number.isFinite(value)) throw new Error('Account switch unavailable');
  return new Date(Math.max(Date.now(), value + 1)).toISOString();
}
function conflict(): WebAccountMutationResponse {
  return {
    accounts: [],
    activeAccountId: null,
    success: false,
    errorCode: 'switch_conflict',
    error: 'Account switch state changed',
  };
}

export async function switchStoredAccount({
  request,
  device,
  accountId,
  payload,
  listAccounts,
  resolveIdentity,
  revokeTempAuth,
}: {
  request: Request;
  device: WebAccountDevice;
  accountId: string;
  payload: SwitchAccountPayload;
  listAccounts: (device: WebAccountDevice) => Promise<WebAccountsResponse>;
  resolveIdentity: (fallback: {
    avatarUrl: string | null;
    displayName: string | null;
  }) => { avatar_url: string | null; display_name: string | null };
  revokeTempAuth: (userId: string) => Promise<void>;
}): Promise<WebAccountMutationResponse> {
  try {
    const credentials = await getDeviceCredentialCandidates(request);
    if (
      !credentials.some(
        (c) => c.deviceId === device.deviceId && c.secret === device.secret
      )
    )
      return conflict();
    const secretHash = hashDeviceSecret(device.secret);
    const db = (await createAdminClient({ noCookie: true })).schema('private');
    const observedDevice = await db
      .from('web_account_devices')
      .select('id, active_user_id, last_seen_at, revoked_at')
      .eq('id', device.deviceId)
      .eq('secret_hash', secretHash)
      .is('revoked_at', null)
      .maybeSingle();
    const observedTarget = await db
      .from('web_account_sessions')
      .select(
        'device_id, user_id, updated_at, session_ciphertext, last_route, avatar_url, display_name'
      )
      .eq('device_id', device.deviceId)
      .eq('user_id', accountId)
      .maybeSingle();
    const parsedDevice = deviceSchema.safeParse(observedDevice.data);
    const parsedTarget = targetSchema.safeParse(observedTarget.data);
    if (observedDevice.error || observedTarget.error || !parsedDevice.success)
      return conflict();
    const accountNotFound = async (): Promise<WebAccountMutationResponse> => ({
      ...(await listAccounts(device)),
      success: false,
      requiresReauth: true,
      error: 'Account not found',
    });
    if (observedTarget.data === null) return await accountNotFound();
    if (!parsedTarget.success) return conflict();
    const d = parsedDevice.data,
      row = parsedTarget.data;
    if (
      d.revoked_at ||
      d.id !== device.deviceId ||
      row.device_id !== d.id ||
      row.user_id !== accountId
    )
      return conflict();
    const targetSession = decryptSession(row.session_ciphertext, row.user_id);
    if (!targetSession) return await accountNotFound();

    const auth = await createAccountSwitchAuth(request);
    const outgoing = await auth.readOutgoing();
    if (
      outgoing &&
      outgoing.user.id === d.active_user_id &&
      outgoing.user.id !== accountId
    ) {
      const prior = await db
        .from('web_account_sessions')
        .select('session_ciphertext, updated_at')
        .eq('device_id', d.id)
        .eq('user_id', outgoing.user.id)
        .maybeSingle();
      const parsed = z
        .object({ session_ciphertext: z.string(), updated_at: z.string() })
        .safeParse(prior.data);
      if (prior.error) return conflict();
      const stored = parsed.success
        ? decryptSession(parsed.data.session_ciphertext, outgoing.user.id)
        : null;
      if (parsed.success && stored) {
        const route =
          payload.currentRoute && isWebOriginRequest(request, BASE_URL)
            ? normalizePersistableMultiAccountRoute(
                payload.currentRoute,
                request,
                null
              )
            : null;
        const saved = await db
          .from('web_account_sessions')
          .update({
            session_ciphertext: encryptSession({
              ...stored,
              access_token: outgoing.access_token,
              refresh_token: outgoing.refresh_token,
              expires_at: outgoing.expires_at,
            }),
            session_expires_at: outgoing.expires_at
              ? new Date(outgoing.expires_at * 1000).toISOString()
              : null,
            ...(route
              ? {
                  last_route: route,
                  last_workspace_id: getWorkspaceIdFromMultiAccountRoute(route),
                }
              : {}),
            updated_at: advanceVersion(parsed.data.updated_at),
          })
          .eq('device_id', d.id)
          .eq('user_id', outgoing.user.id)
          .eq('updated_at', parsed.data.updated_at)
          .select('user_id');
        if (saved.error || saved.data?.length !== 1) return conflict();
      }
    }
    const stored = outgoing?.user.id === accountId ? outgoing : targetSession;
    const { data, error } = await auth.refreshTarget({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
    });
    if (error || !data.session || data.session.user.id !== accountId)
      return {
        ...(await listAccounts(device)),
        success: false,
        requiresReauth: true,
        error: 'Stored session is no longer valid',
      };
    const session = data.session;
    const identity = resolveIdentity({
      avatarUrl: row.avatar_url,
      displayName: row.display_name,
    });
    const updated = await db
      .from('web_account_sessions')
      .update({
        ...identity,
        last_active_at: new Date().toISOString(),
        session_ciphertext: encryptSession(session),
        session_expires_at: session.expires_at
          ? new Date(session.expires_at * 1000).toISOString()
          : null,
        updated_at: advanceVersion(row.updated_at),
      })
      .eq('device_id', d.id)
      .eq('user_id', accountId)
      .eq('updated_at', row.updated_at)
      .select('user_id');
    if (updated.error || updated.data?.length !== 1) return conflict();
    let activation = db
      .from('web_account_devices')
      .update({
        active_user_id: accountId,
        last_seen_at: advanceVersion(d.last_seen_at),
      })
      .eq('id', d.id)
      .eq('secret_hash', secretHash)
      .eq('last_seen_at', d.last_seen_at)
      .is('revoked_at', null);
    activation =
      d.active_user_id === null
        ? activation.is('active_user_id', null)
        : activation.eq('active_user_id', d.active_user_id);
    const activated = await activation.select('id');
    if (activated.error || activated.data?.length !== 1) return conflict();
    // Cleanup uses the observed actor, without a cookie-bound provider read.
    if (outgoing?.user.id === d.active_user_id)
      await revokeTempAuth(outgoing.user.id);
    const accounts = await listAccounts({ ...device, activeUserId: accountId });
    await auth.commit(session);
    return {
      ...accounts,
      success: true,
      accountId,
      redirectTo: resolveMultiAccountSwitchRedirect(
        { lastRoute: row.last_route, targetRoute: payload.targetRoute },
        request
      ),
    };
  } catch {
    return conflict();
  }
}
