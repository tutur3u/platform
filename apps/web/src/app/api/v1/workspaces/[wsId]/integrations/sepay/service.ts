import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { getSepayWebhookAuthSecret } from '@/lib/sepay';
import {
  createSepayWebhook,
  deleteSepayWebhook,
  listSepayBankAccounts,
  refreshSepayAccessToken,
} from '@/lib/sepay-api';
import { decryptSepayToken, encryptSepayToken } from '@/lib/sepay-crypto';
import { createSepayEndpointTokenRow } from './shared';

type SepayAdminClient = TypedSupabaseClient;

interface SepayConnectionRow {
  access_token_encrypted: string;
  access_token_expires_at: string;
  id: string;
  refresh_token_encrypted: string;
  scopes: string[];
  status: 'active' | 'error' | 'revoked';
  ws_id: string;
}

function resolveSepayBankAccountKey(account: {
  account_number?: string | null;
  bank_account_id?: string | null;
  id?: string | null;
}) {
  const bankAccountId = account.bank_account_id?.trim();
  if (bankAccountId && /^\d+$/.test(bankAccountId)) {
    return bankAccountId;
  }

  const fallbackId = account.id?.trim();
  return fallbackId && /^\d+$/.test(fallbackId) ? fallbackId : null;
}

function resolveConfiguredOrigin(value?: string) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function resolveSepayAppOrigin() {
  const origin =
    resolveConfiguredOrigin(process.env.WEB_APP_URL) ||
    resolveConfiguredOrigin(process.env.NEXT_PUBLIC_WEB_APP_URL) ||
    resolveConfiguredOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    (DEV_MODE ? 'http://localhost:7803' : null);

  if (!origin) {
    throw new Error(
      'SePay integration requires WEB_APP_URL, NEXT_PUBLIC_WEB_APP_URL, or NEXT_PUBLIC_APP_URL'
    );
  }

  return origin;
}

export function buildSepayOauthCallbackUrl(wsId: string) {
  const origin = resolveSepayAppOrigin();
  return `${origin}/api/v1/workspaces/${encodeURIComponent(wsId)}/integrations/sepay/oauth/callback`;
}

async function resolveConnection(input: {
  sbAdmin: SepayAdminClient;
  wsId: string;
}) {
  const { data, error } = await input.sbAdmin
    .from('sepay_connections')
    .select(
      'id, ws_id, status, access_token_encrypted, refresh_token_encrypted, access_token_expires_at, scopes'
    )
    .eq('ws_id', input.wsId)
    .in('status', ['active', 'error'])
    .maybeSingle();

  if (error) {
    throw new Error('Failed to load SePay connection');
  }

  return (data as SepayConnectionRow | null) ?? null;
}

export async function ensureSepayAccessToken(input: {
  sbAdmin: SepayAdminClient;
  wsId: string;
}) {
  const connection = await resolveConnection({
    sbAdmin: input.sbAdmin,
    wsId: input.wsId,
  });

  if (!connection) {
    throw new Error('SePay connection not found');
  }

  const expiry = new Date(connection.access_token_expires_at).getTime();
  const shouldRefresh =
    !Number.isFinite(expiry) || expiry - Date.now() < 60_000;

  if (!shouldRefresh) {
    return {
      accessToken: decryptSepayToken(connection.access_token_encrypted),
      connection,
    };
  }

  let refreshed: Awaited<ReturnType<typeof refreshSepayAccessToken>>;
  try {
    refreshed = await refreshSepayAccessToken({
      refreshTokenEncrypted: connection.refresh_token_encrypted,
    });
  } catch (error) {
    const { error: statusError } = await input.sbAdmin
      .from('sepay_connections')
      .update({
        status: 'error',
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)
      .eq('ws_id', input.wsId);

    if (statusError) {
      console.error(
        'Failed to persist SePay connection refresh error state:',
        statusError
      );
    }

    throw error;
  }

  const encryptedAccessToken = encryptSepayToken(refreshed.accessToken);
  const encryptedRefreshToken = encryptSepayToken(refreshed.refreshToken);

  const { error: updateError } = await input.sbAdmin
    .from('sepay_connections')
    .update({
      access_token_encrypted: encryptedAccessToken,
      access_token_expires_at: refreshed.expiresAt,
      refresh_token_encrypted: encryptedRefreshToken,
      scopes: refreshed.scopes,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id)
    .eq('ws_id', input.wsId);

  if (updateError) {
    throw new Error('Failed to persist refreshed SePay tokens');
  }

  return {
    accessToken: refreshed.accessToken,
    connection,
  };
}

async function findWalletLink(input: {
  bankAccountId: string;
  sbAdmin: SepayAdminClient;
  subAccountId: string | null;
  wsId: string;
}) {
  let query = input.sbAdmin
    .from('sepay_wallet_links')
    .select('wallet_id')
    .eq('ws_id', input.wsId)
    .eq('active', true)
    .eq('sepay_bank_account_id', input.bankAccountId)
    .limit(1);

  if (input.subAccountId) {
    query = query.eq('sepay_sub_account_id', input.subAccountId);
  } else {
    query = query.is('sepay_sub_account_id', null);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error('Failed to lookup SePay wallet link');
  }

  return data?.wallet_id ?? null;
}

async function createWalletForSepayAccount(input: {
  accountNumber: string | null;
  gateway: string | null;
  sbAdmin: SepayAdminClient;
  wsId: string;
}) {
  const suffix = input.accountNumber
    ? input.accountNumber.slice(Math.max(0, input.accountNumber.length - 4))
    : null;
  const gateway = input.gateway ?? 'Bank';
  const walletName = suffix
    ? `SePay ${gateway} *${suffix}`
    : `SePay ${gateway}`;

  const { data, error } = await input.sbAdmin
    .from('workspace_wallets')
    .insert({
      currency: 'VND',
      description: 'Auto-created from SePay account sync',
      name: walletName,
      report_opt_in: true,
      type: 'STANDARD',
      ws_id: input.wsId,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error('Failed to create wallet for SePay bank account');
  }

  return data.id;
}

export async function syncSepayBankAccounts(input: {
  sbAdmin: SepayAdminClient;
  wsId: string;
}) {
  const { accessToken } = await ensureSepayAccessToken({
    sbAdmin: input.sbAdmin,
    wsId: input.wsId,
  });

  const bankAccounts = await listSepayBankAccounts({ accessToken });
  let linkedCount = 0;

  for (const account of bankAccounts) {
    const bankAccountId = resolveSepayBankAccountKey(account);

    if (!bankAccountId) {
      continue;
    }

    const subAccountId = account.sub_account_id ?? null;
    const existingWalletId = await findWalletLink({
      bankAccountId,
      sbAdmin: input.sbAdmin,
      subAccountId,
      wsId: input.wsId,
    });

    if (existingWalletId) {
      linkedCount += 1;
      continue;
    }

    const walletId = await createWalletForSepayAccount({
      accountNumber: account.account_number ?? null,
      gateway: account.gateway ?? null,
      sbAdmin: input.sbAdmin,
      wsId: input.wsId,
    });

    const { error: linkError } = await input.sbAdmin
      .from('sepay_wallet_links')
      .insert({
        active: true,
        metadata: {
          account_number: account.account_number ?? null,
          gateway: account.gateway ?? null,
          source: 'oauth_sync',
        },
        sepay_account_number: account.account_number ?? null,
        sepay_bank_account_id: bankAccountId,
        sepay_gateway: account.gateway ?? null,
        sepay_sub_account_id: subAccountId,
        wallet_id: walletId,
        ws_id: input.wsId,
      });

    if (linkError) {
      const { error: deleteWalletError } = await input.sbAdmin
        .from('workspace_wallets')
        .delete()
        .eq('id', walletId)
        .eq('ws_id', input.wsId);

      if (deleteWalletError) {
        throw new Error(
          'Failed to clean up auto-created wallet after SePay sync link error'
        );
      }

      if (linkError.code !== '23505') {
        throw new Error('Failed to create SePay wallet link from account sync');
      }

      const racedWalletId = await findWalletLink({
        bankAccountId,
        sbAdmin: input.sbAdmin,
        subAccountId,
        wsId: input.wsId,
      });

      if (!racedWalletId) {
        throw new Error(
          'SePay wallet link conflict occurred and existing wallet could not be resolved'
        );
      }
    }

    linkedCount += 1;
  }

  return {
    linkedCount,
    totalAccounts: bankAccounts.length,
  };
}

export async function provisionSepayWebhookEndpoint(input: {
  sbAdmin: SepayAdminClient;
  wsId: string;
}) {
  const { accessToken } = await ensureSepayAccessToken({
    sbAdmin: input.sbAdmin,
    wsId: input.wsId,
  });

  const { data: existingEndpoint, error: endpointError } = await input.sbAdmin
    .from('sepay_webhook_endpoints')
    .select('id, token_prefix, sepay_webhook_id')
    .eq('ws_id', input.wsId)
    .eq('active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (endpointError) {
    throw new Error('Failed to load existing SePay webhook endpoint');
  }

  if (existingEndpoint?.sepay_webhook_id) {
    return {
      endpointId: existingEndpoint.id,
      webhookId: existingEndpoint.sepay_webhook_id,
      webhookUrl: null,
    };
  }

  if (existingEndpoint?.id) {
    const { error: deactivateError } = await input.sbAdmin
      .from('sepay_webhook_endpoints')
      .update({ active: false, rotated_at: new Date().toISOString() })
      .eq('id', existingEndpoint.id)
      .eq('ws_id', input.wsId)
      .eq('active', true)
      .is('deleted_at', null);

    if (deactivateError) {
      throw new Error(
        'Failed to deactivate stale SePay endpoint before reprovisioning'
      );
    }
  }

  const webhookApiKey = getSepayWebhookAuthSecret();
  if (!webhookApiKey) {
    throw new Error('Missing SEPAY_WEBHOOK_API_KEY or SEPAY_WEBHOOK_SECRET');
  }

  const bankAccounts = await listSepayBankAccounts({ accessToken });
  const activeBankAccount =
    bankAccounts.find(
      (account) =>
        account.active !== false && resolveSepayBankAccountKey(account)
    ) ?? bankAccounts.find((account) => resolveSepayBankAccountKey(account));
  const bankAccountId = activeBankAccount
    ? resolveSepayBankAccountKey(activeBankAccount)
    : null;

  if (!activeBankAccount || !bankAccountId) {
    throw new Error('No SePay bank account found for webhook provisioning');
  }

  const origin = resolveSepayAppOrigin();

  const { data, error, token } = await createSepayEndpointTokenRow({
    sbAdmin: input.sbAdmin,
    wsId: input.wsId,
  });

  if (error || !data?.id) {
    throw new Error('Failed to create SePay endpoint token');
  }

  const endpointId = data.id;

  if (!token) {
    throw new Error('Provisioning requires a newly created endpoint token');
  }
  const webhookUrl = `${origin}/api/v1/webhooks/sepay/${token}`;
  let webhook: Awaited<ReturnType<typeof createSepayWebhook>>;
  try {
    webhook = await createSepayWebhook({
      accessToken,
      bankAccountId,
      callbackUrl: webhookUrl,
      name: activeBankAccount.label
        ? `Tuturuuu - ${activeBankAccount.label}`
        : 'Tuturuuu Finance Integration',
      requestApiKey: webhookApiKey,
    });
  } catch (error) {
    const cleanupTimestamp = new Date().toISOString();
    const { error: cleanupError } = await input.sbAdmin
      .from('sepay_webhook_endpoints')
      .update({
        active: false,
        deleted_at: cleanupTimestamp,
        rotated_at: cleanupTimestamp,
      })
      .eq('id', endpointId)
      .eq('ws_id', input.wsId)
      .is('deleted_at', null);

    if (cleanupError) {
      console.error(
        'Failed to clean up orphaned SePay endpoint token row after remote webhook creation failure',
        {
          cleanupError,
          endpointId,
          wsId: input.wsId,
        }
      );
    }

    throw error;
  }

  const { data: matchedWalletLink, error: walletLinkError } =
    await input.sbAdmin
      .from('sepay_wallet_links')
      .select('wallet_id')
      .eq('ws_id', input.wsId)
      .eq('active', true)
      .eq('sepay_bank_account_id', bankAccountId)
      .is('sepay_sub_account_id', null)
      .limit(1)
      .maybeSingle();

  if (walletLinkError) {
    throw new Error('Failed to resolve SePay wallet link for webhook endpoint');
  }

  const { error: updateError } = await input.sbAdmin
    .from('sepay_webhook_endpoints')
    .update({
      sepay_webhook_id: webhook.webhookId,
      wallet_id: matchedWalletLink?.wallet_id ?? null,
    })
    .eq('id', endpointId)
    .eq('ws_id', input.wsId)
    .is('deleted_at', null);

  if (updateError) {
    console.error(
      'Failed to persist SePay webhook identifier after remote creation',
      {
        endpointId,
        updateError,
        webhookId: webhook.webhookId,
        wsId: input.wsId,
      }
    );

    try {
      await deleteSepayWebhook({
        accessToken,
        webhookId: webhook.webhookId,
      });
    } catch (cleanupError) {
      console.error(
        'Failed to clean up remote SePay webhook after DB update failure',
        {
          cleanupError,
          endpointId,
          webhookId: webhook.webhookId,
          wsId: input.wsId,
        }
      );
    }

    throw new Error('Failed to persist SePay webhook identifier');
  }

  return {
    endpointId,
    webhookId: webhook.webhookId,
    webhookUrl,
  };
}
