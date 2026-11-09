import { createClient } from '@tuturuuu/supabase/next/server';
import { BASE_URL } from '@/constants/common';
import { getPlatformSql } from '@/lib/database/platform-sql';
import { decryptSession, encryptSession, hashDeviceSecret } from './crypto';
import {
  getWorkspaceIdFromMultiAccountRoute,
  isWebOriginRequest,
  normalizePersistableMultiAccountRoute,
  resolveMultiAccountSwitchRedirect,
} from './routes';
import {
  StaleAccountSwitchError,
  withAccountSwitchTransaction,
} from './switch-transaction';
import type {
  SwitchAccountPayload,
  WebAccountDevice,
  WebAccountMutationResponse,
  WebAccountsResponse,
} from './types';

export async function switchStoredAccount({
  request,
  device,
  accountId,
  payload,
  listAccounts,
  revokeTempAuth,
}: {
  request: Request;
  device: WebAccountDevice;
  accountId: string;
  payload: SwitchAccountPayload;
  listAccounts: (device: WebAccountDevice) => Promise<WebAccountsResponse>;
  revokeTempAuth: (
    client: Awaited<ReturnType<typeof createClient>>
  ) => Promise<void>;
}): Promise<WebAccountMutationResponse> {
  try {
    const switched = await withAccountSwitchTransaction(
      getPlatformSql(),
      device,
      hashDeviceSecret(device.secret),
      accountId,
      async (transaction) => {
        const [deviceRow] = await transaction<
          { active_user_id: string | null }[]
        >`
          select active_user_id from private.web_account_devices where id::text = ${device.deviceId}
        `;
        const [row] = await transaction<
          { session_ciphertext: string; last_route: string | null }[]
        >`
          select session_ciphertext, last_route from private.web_account_sessions
          where device_id::text = ${device.deviceId} and user_id::text = ${accountId}
        `;
        if (!row || !deviceRow) throw new StaleAccountSwitchError();
        const supabase = await createClient(request);
        const {
          data: { session: active },
        } = await supabase.auth.getSession();
        if (active && active.user.id === deviceRow.active_user_id) {
          const route =
            payload.currentRoute && isWebOriginRequest(request, BASE_URL)
              ? normalizePersistableMultiAccountRoute(
                  payload.currentRoute,
                  request,
                  null
                )
              : null;
          await transaction`
            update private.web_account_sessions set
              session_ciphertext = ${encryptSession(active)},
              session_expires_at = ${active.expires_at ? new Date(active.expires_at * 1000).toISOString() : null},
              last_route = coalesce(${route}, last_route),
              last_workspace_id = case when ${route}::text is not null then ${getWorkspaceIdFromMultiAccountRoute(route)} else last_workspace_id end,
              updated_at = now()
            where device_id::text = ${device.deviceId} and user_id::text = ${active.user.id}
          `;
        }
        await revokeTempAuth(supabase);
        const stored =
          active?.user.id === accountId
            ? active
            : decryptSession(row.session_ciphertext);
        const { data, error } = await supabase.auth.setSession({
          access_token: stored.access_token,
          refresh_token: stored.refresh_token,
        });
        if (error || !data.session || data.session.user.id !== accountId) {
          const removed = await transaction`
            delete from private.web_account_sessions
            where device_id::text = ${device.deviceId} and user_id::text = ${accountId}
          `;
          if (removed.count !== 1) throw new StaleAccountSwitchError();
          return {
            success: false,
            requiresReauth: true,
            error: error?.message ?? 'Stored session is no longer valid',
          };
        }
        const updated = await transaction`
          update private.web_account_sessions set last_active_at = now(),
            session_ciphertext = ${encryptSession(data.session)},
            session_expires_at = ${data.session.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : null},
            updated_at = now()
          where device_id::text = ${device.deviceId} and user_id::text = ${accountId}
        `;
        const activated = await transaction`
          update private.web_account_devices set active_user_id = ${accountId}, last_seen_at = now()
          where id::text = ${device.deviceId} and secret_hash = ${hashDeviceSecret(device.secret)} and revoked_at is null
        `;
        if (updated.count !== 1 || activated.count !== 1)
          throw new StaleAccountSwitchError();
        return {
          success: true,
          accountId,
          redirectTo: resolveMultiAccountSwitchRedirect(
            { lastRoute: row.last_route, targetRoute: payload.targetRoute },
            request
          ),
        };
      }
    );
    return {
      ...(await listAccounts(
        switched.success ? { ...device, activeUserId: accountId } : device
      )),
      ...switched,
    };
  } catch (error) {
    if (!(error instanceof StaleAccountSwitchError)) throw error;
    return {
      accounts: [],
      activeAccountId: null,
      success: false,
      error: error.message,
    };
  }
}
