import type { FinanceRouteContext } from '@tuturuuu/apis/finance/request-access';

export async function validateInvoiceWallet({
  sbAdmin,
  walletId,
  wsId,
}: {
  sbAdmin: FinanceRouteContext['sbAdmin'];
  walletId: string;
  wsId: string;
}) {
  const { data, error } = await sbAdmin
    .schema('private')
    .from('workspace_wallets')
    .select('id')
    .eq('id', walletId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      status: 500 as const,
      message: 'Failed to validate invoice wallet',
      error,
    };
  }

  if (!data) {
    return {
      ok: false as const,
      status: 400 as const,
      message: 'Invalid invoice wallet',
    };
  }

  return { ok: true as const };
}
