import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type {
  WalletCheckpoint,
  WalletCheckpointCurrencyTotal,
  WalletCheckpointInterval,
  WalletCheckpointIntervalRow,
  WalletCheckpointRow,
  WalletCheckpointSummaryWallet,
} from './types';

export const WALLET_CHECKPOINT_SELECT =
  'id,wallet_id,checked_at,actual_balance,ledger_balance,currency,note,created_by,created_at,updated_at';

// Supabase returns numeric columns as strings in some runtimes and numbers in
// others. Normalize at the API boundary so the UI and internal API stay typed.
export function toCheckpointNumber(value: number | string | null | undefined) {
  const parsed =
    typeof value === 'number' ? value : Number.parseFloat(value ?? '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeCheckpoint(
  row: WalletCheckpointRow,
  currentLedgerBalance?: number | string | null
): WalletCheckpoint {
  const actualBalance = toCheckpointNumber(row.actual_balance);
  const ledgerBalance = toCheckpointNumber(row.ledger_balance);
  const currentLedger = toCheckpointNumber(
    currentLedgerBalance ?? ledgerBalance
  );

  return {
    actual_balance: actualBalance,
    checked_at: row.checked_at,
    created_at: row.created_at,
    created_by: row.created_by,
    currency: row.currency,
    current_ledger_balance: currentLedger,
    current_variance: actualBalance - currentLedger,
    id: row.id,
    ledger_balance: ledgerBalance,
    note: row.note,
    original_variance: actualBalance - ledgerBalance,
    updated_at: row.updated_at,
    wallet_id: row.wallet_id,
  };
}

export function normalizeInterval(
  row: WalletCheckpointIntervalRow
): WalletCheckpointInterval {
  const variance = toCheckpointNumber(row.interval_variance);

  return {
    actual_delta: toCheckpointNumber(row.actual_delta),
    end_actual_balance: toCheckpointNumber(row.end_actual_balance),
    end_checked_at: row.end_checked_at,
    end_checkpoint_id: row.end_checkpoint_id,
    interval_variance: variance,
    is_clean: variance === 0,
    ledger_delta: toCheckpointNumber(row.ledger_delta),
    start_actual_balance: toCheckpointNumber(row.start_actual_balance),
    start_checked_at: row.start_checked_at,
    start_checkpoint_id: row.start_checkpoint_id,
    transaction_count: Number(row.transaction_count),
  };
}

export function normalizeSummaryWallet(
  wallet: Record<string, unknown>
): WalletCheckpointSummaryWallet {
  return {
    balance: toCheckpointNumber(wallet.balance as number | string | null),
    currency: String(wallet.currency ?? 'USD'),
    icon: typeof wallet.icon === 'string' ? wallet.icon : null,
    id: String(wallet.id),
    image_src: typeof wallet.image_src === 'string' ? wallet.image_src : null,
    name: typeof wallet.name === 'string' ? wallet.name : null,
    type: typeof wallet.type === 'string' ? wallet.type : null,
  };
}

export function summarizeCheckpointTotals(
  checkpoints: WalletCheckpoint[]
): WalletCheckpointCurrencyTotal[] {
  const totals = new Map<string, WalletCheckpointCurrencyTotal>();

  for (const checkpoint of checkpoints) {
    const existing =
      totals.get(checkpoint.currency) ??
      ({
        actual_total: 0,
        checkpoint_count: 0,
        currency: checkpoint.currency,
        ledger_total: 0,
        variance_total: 0,
      } satisfies WalletCheckpointCurrencyTotal);

    existing.actual_total += checkpoint.actual_balance;
    existing.ledger_total += checkpoint.current_ledger_balance;
    existing.variance_total += checkpoint.current_variance;
    existing.checkpoint_count += 1;
    totals.set(checkpoint.currency, existing);
  }

  return [...totals.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency)
  );
}

export async function parseJsonBody(request: Request) {
  try {
    return { data: await request.json() };
  } catch {
    return {
      response: NextResponse.json(
        { message: 'Malformed JSON request body' },
        { status: 400 }
      ),
    };
  }
}

export function validationErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        issues: error.issues,
        message: 'Invalid checkpoint payload',
      },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { message: 'Invalid checkpoint payload' },
    { status: 400 }
  );
}

export function checkpointDatabaseErrorResponse(error: {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
}) {
  if (error.code === '23505') {
    return NextResponse.json(
      { message: 'A checkpoint already exists for this wallet timestamp' },
      { status: 409 }
    );
  }

  if (error.code === '23514') {
    return NextResponse.json(
      { message: 'Checkpoint payload violates database constraints' },
      { status: 400 }
    );
  }

  if (error.code === '22P02' || error.code === '22023') {
    return NextResponse.json(
      { message: 'Invalid checkpoint payload' },
      { status: 400 }
    );
  }

  if (error.code === 'P0002') {
    return NextResponse.json({ message: 'Wallet not found' }, { status: 404 });
  }

  if (isCheckpointStorageMissing(error)) {
    return NextResponse.json(
      { message: 'Wallet checkpoint storage is not ready' },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { message: 'Error saving wallet checkpoint' },
    { status: 500 }
  );
}

export function isCheckpointStorageMissing(error: {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
}) {
  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const mentionsCheckpointStorage =
    text.includes('workspace_wallet_checkpoints') ||
    text.includes('wallet_checkpoint') ||
    text.includes('get_wallet_ledger_balance_at') ||
    text.includes('list_wallet_checkpoint_intervals') ||
    text.includes('create_workspace_wallet_checkpoints_batch');

  if (!mentionsCheckpointStorage) {
    return false;
  }

  if (
    error.code === '42P01' ||
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST205'
  ) {
    return true;
  }

  return (
    text.includes('does not exist') ||
    text.includes('could not find') ||
    text.includes('schema cache')
  );
}

export async function getLedgerBalanceAt({
  checkedAt,
  sbAdmin,
  walletId,
}: {
  checkedAt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sbAdmin: any;
  walletId: string;
}) {
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('get_wallet_ledger_balance_at', {
      _checked_at: checkedAt,
      _wallet_id: walletId,
    });

  if (error) {
    throw error;
  }

  return toCheckpointNumber(data as number | string | null);
}

export async function getLedgerBalanceForCheckpointRead({
  checkedAt,
  fallbackLedgerBalance,
  sbAdmin,
  walletId,
}: {
  checkedAt: string;
  fallbackLedgerBalance: number | string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sbAdmin: any;
  walletId: string;
}) {
  try {
    return await getLedgerBalanceAt({ checkedAt, sbAdmin, walletId });
  } catch (error) {
    if (
      isCheckpointStorageMissing(error as { code?: string; message?: string })
    ) {
      return fallbackLedgerBalance;
    }

    throw error;
  }
}

export async function listCheckpointIntervals({
  limit,
  sbAdmin,
  walletId,
}: {
  limit: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sbAdmin: any;
  walletId: string;
}) {
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('list_wallet_checkpoint_intervals', {
      _limit: limit,
      _wallet_id: walletId,
    });

  if (error) {
    if (isCheckpointStorageMissing(error)) {
      return [];
    }

    throw error;
  }

  return ((data ?? []) as WalletCheckpointIntervalRow[]).map(normalizeInterval);
}

export function getCheckpointLimit(request: Request) {
  const rawLimit = new URL(request.url).searchParams.get('limit');
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 25;

  if (!Number.isFinite(parsedLimit)) {
    return 25;
  }

  return Math.max(1, Math.min(parsedLimit, 100));
}
