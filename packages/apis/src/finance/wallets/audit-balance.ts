import { listWalletAuditStatuses } from './checkpoints/helpers';

export async function attachWalletAuditData<T extends Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sbAdmin: any,
  wallets: T[]
): Promise<{ data: T[]; error: unknown | null }> {
  const walletIds = [
    ...new Set(
      wallets
        .map((wallet) => wallet.id)
        .filter((id): id is string => typeof id === 'string')
    ),
  ];

  if (walletIds.length === 0) {
    return { data: wallets, error: null };
  }

  try {
    const statuses = await listWalletAuditStatuses({ sbAdmin, walletIds });
    const statusByWalletId = new Map(
      statuses.map((status) => [status.wallet_id, status])
    );

    return {
      data: wallets.map((wallet) => {
        if (typeof wallet.id !== 'string') {
          return wallet;
        }

        const status = statusByWalletId.get(wallet.id);
        if (!status) {
          return wallet;
        }

        return {
          ...wallet,
          audit_actual_balance: status.latest_actual_balance,
          audit_balance: status.audited_balance,
          audit_checkpoint_id: status.latest_checkpoint_id,
          audit_checked_at: status.latest_checked_at,
          audit_ledger_balance: status.ledger_balance,
          audit_post_checkpoint_delta: status.post_checkpoint_delta,
          audit_post_checkpoint_transaction_count:
            status.post_checkpoint_transaction_count,
          audit_status: status.status,
          audit_variance: status.variance,
        };
      }),
      error: null,
    };
  } catch (error) {
    return { data: wallets, error };
  }
}
