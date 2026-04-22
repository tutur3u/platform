import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { NormalizedSepayPayload } from './schemas';

type SepayAdminClient = TypedSupabaseClient;

async function findLinkedWalletId(input: {
  payload: NormalizedSepayPayload;
  sbAdmin: SepayAdminClient;
  wsId: string;
}) {
  let walletLinkQuery = input.sbAdmin
    .from('sepay_wallet_links')
    .select('wallet_id, sepay_gateway')
    .eq('ws_id', input.wsId)
    .eq('active', true)
    .limit(10);

  if (input.payload.bankAccountId) {
    walletLinkQuery = walletLinkQuery.eq(
      'sepay_bank_account_id',
      input.payload.bankAccountId
    );

    if (input.payload.subAccountId) {
      walletLinkQuery = walletLinkQuery.eq(
        'sepay_sub_account_id',
        input.payload.subAccountId
      );
    } else {
      walletLinkQuery = walletLinkQuery.is('sepay_sub_account_id', null);
    }
  }

  if (input.payload.accountNumber) {
    walletLinkQuery = walletLinkQuery.eq(
      'sepay_account_number',
      input.payload.accountNumber
    );
  }

  const { data: linkedWallet, error: walletLinkError } = await walletLinkQuery;

  if (walletLinkError) {
    throw new Error('Failed to resolve SePay wallet link');
  }

  const walletCandidates = linkedWallet ?? [];
  if (walletCandidates.length === 0) {
    return null;
  }

  const normalizedGateway = input.payload.gateway?.toLowerCase() ?? null;
  const exactGatewayMatch = normalizedGateway
    ? walletCandidates.find(
        (candidate) =>
          candidate.sepay_gateway?.toLowerCase() === normalizedGateway
      )
    : null;

  return (
    exactGatewayMatch?.wallet_id ??
    walletCandidates.find((candidate) => !candidate.sepay_gateway)?.wallet_id ??
    walletCandidates[0]?.wallet_id ??
    null
  );
}

async function findLinkedWalletIdByBankKey(input: {
  bankAccountKey: string;
  sbAdmin: SepayAdminClient;
  subAccountId: string | null;
  wsId: string;
}) {
  let walletLinkQuery = input.sbAdmin
    .from('sepay_wallet_links')
    .select('wallet_id')
    .eq('ws_id', input.wsId)
    .eq('active', true)
    .eq('sepay_bank_account_id', input.bankAccountKey)
    .limit(1);

  if (input.subAccountId) {
    walletLinkQuery = walletLinkQuery.eq(
      'sepay_sub_account_id',
      input.subAccountId
    );
  } else {
    walletLinkQuery = walletLinkQuery.is('sepay_sub_account_id', null);
  }

  const { data: linkedWallet, error: walletLinkError } =
    await walletLinkQuery.maybeSingle();

  if (walletLinkError) {
    throw new Error('Failed to resolve SePay wallet link after conflict');
  }

  return linkedWallet?.wallet_id ?? null;
}

function buildAutoWalletName(input: {
  accountNumber: string | null;
  gateway: string | null;
}) {
  const gatewayLabel = input.gateway ?? 'Bank';
  const suffix = input.accountNumber
    ? input.accountNumber.slice(Math.max(0, input.accountNumber.length - 4))
    : null;

  return suffix ? `SePay ${gatewayLabel} *${suffix}` : `SePay ${gatewayLabel}`;
}

function buildWalletLinkBankAccountKey(payload: {
  accountNumber: string | null;
  bankAccountId: string | null;
  gateway: string | null;
  referenceCode: string | null;
}): string | null {
  if (payload.bankAccountId) {
    return payload.bankAccountId;
  }

  if (payload.accountNumber) {
    return `${payload.gateway ?? 'bank'}:${payload.accountNumber}`;
  }

  if (payload.referenceCode) {
    return `reference:${payload.referenceCode}`;
  }

  return null;
}

export async function resolveOrCreateWallet(input: {
  endpointWalletId: string | null;
  payload: NormalizedSepayPayload;
  sbAdmin: SepayAdminClient;
  wsId: string;
}) {
  if (input.endpointWalletId) {
    const { data, error } = await input.sbAdmin
      .from('workspace_wallets')
      .select('id')
      .eq('id', input.endpointWalletId)
      .eq('ws_id', input.wsId)
      .maybeSingle();

    if (error) {
      throw new Error('Failed to verify endpoint wallet');
    }

    if (data?.id) {
      return data.id;
    }

    throw new Error('Endpoint wallet is not valid for this workspace');
  }

  const hasLinkIdentifiers =
    Boolean(input.payload.bankAccountId) ||
    Boolean(input.payload.accountNumber);

  if (hasLinkIdentifiers) {
    const linkedWalletId = await findLinkedWalletId({
      payload: input.payload,
      sbAdmin: input.sbAdmin,
      wsId: input.wsId,
    });

    if (linkedWalletId) {
      return linkedWalletId;
    }
  }

  const walletName = buildAutoWalletName({
    accountNumber: input.payload.accountNumber,
    gateway: input.payload.gateway,
  });

  const { data: createdWallet, error: createWalletError } = await input.sbAdmin
    .from('workspace_wallets')
    .insert({
      currency: 'VND',
      description: 'Auto-created from SePay webhook ingestion',
      name: walletName,
      report_opt_in: true,
      type: 'STANDARD',
      ws_id: input.wsId,
    })
    .select('id')
    .single();

  if (createWalletError || !createdWallet?.id) {
    throw new Error('Failed to auto-create wallet for SePay account');
  }

  const bankAccountKey = buildWalletLinkBankAccountKey({
    accountNumber: input.payload.accountNumber,
    bankAccountId: input.payload.bankAccountId,
    gateway: input.payload.gateway,
    referenceCode: input.payload.referenceCode,
  });

  if (!bankAccountKey) {
    throw new Error(
      'Cannot auto-create a SePay wallet link without a stable account identifier'
    );
  }

  const { error: createWalletLinkError } = await input.sbAdmin
    .from('sepay_wallet_links')
    .insert({
      active: true,
      metadata: {
        account_number: input.payload.accountNumber,
        gateway: input.payload.gateway,
        source: 'webhook_auto_create',
      },
      sepay_account_number: input.payload.accountNumber,
      sepay_bank_account_id: bankAccountKey,
      sepay_gateway: input.payload.gateway,
      sepay_sub_account_id: input.payload.subAccountId,
      wallet_id: createdWallet.id,
      ws_id: input.wsId,
    });

  if (createWalletLinkError) {
    if (createWalletLinkError.code !== '23505') {
      throw new Error('Failed to create SePay wallet link');
    }

    const { error: deleteWalletError } = await input.sbAdmin
      .from('workspace_wallets')
      .delete()
      .eq('id', createdWallet.id)
      .eq('ws_id', input.wsId);

    if (deleteWalletError) {
      throw new Error(
        'Failed to clean up auto-created wallet after SePay link conflict'
      );
    }

    const linkedWalletId = await findLinkedWalletIdByBankKey({
      bankAccountKey,
      sbAdmin: input.sbAdmin,
      subAccountId: input.payload.subAccountId,
      wsId: input.wsId,
    });

    if (linkedWalletId) {
      return linkedWalletId;
    }

    throw new Error(
      'Wallet link conflict occurred and winner could not be resolved'
    );
  }

  return createdWallet.id;
}
