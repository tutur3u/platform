import type {
  FinanceBudgetUpsertPayload,
  FinanceTagPayload,
  FinanceTransferMigratePayload,
  FinanceTransferPayload,
  FinanceTransferUpdatePayload,
  ListTransactionsQuery,
  RecurringTransactionPayload,
  TransactionCategoryPayload,
  TransactionExportQuery,
  TransactionPayload,
  WalletPayload,
} from '../platform-finance';
import { type FlagValue, getFlag, parseCsv } from './args';
import { getFinancePagination } from './finance-pagination';
import { normalizeCliDateTime, pickCliTimeZone } from './timezone';

export function parseFinanceNumber(value?: string) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function pickFinanceString(
  flags: Record<string, FlagValue>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = getFlag(flags, key);
    if (value !== undefined) return value;
  }
}

function parseJsonPayload(flags: Record<string, FlagValue>) {
  const payload = getFlag(flags, 'json-payload');
  return payload ? (JSON.parse(payload) as Record<string, unknown>) : {};
}

function parseBoolean(value: FlagValue | undefined) {
  if (value === true) return true;
  if (typeof value !== 'string') return undefined;

  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
      return true;
    case '0':
    case 'false':
    case 'no':
      return false;
    default:
      return undefined;
  }
}

function assignDefined<T extends Record<string, unknown>>(
  payload: T,
  key: keyof T,
  value: unknown
) {
  if (value !== undefined) {
    payload[key] = value as T[keyof T];
  }
}

function mergePayload<T extends Record<string, unknown>>(
  payload: T,
  flags: Record<string, FlagValue>
): T {
  return {
    ...payload,
    ...parseJsonPayload(flags),
  };
}

export function getFinancePositionalName(positionals: string[]) {
  return positionals.slice(3).join(' ').trim() || undefined;
}

export function getWalletPayload(
  flags: Record<string, FlagValue>,
  positionalName?: string
) {
  const payload: Record<string, unknown> = {};
  assignDefined(payload, 'id', pickFinanceString(flags, 'id'));
  assignDefined(
    payload,
    'name',
    pickFinanceString(flags, 'name') || positionalName
  );
  assignDefined(
    payload,
    'balance',
    parseFinanceNumber(pickFinanceString(flags, 'balance'))
  );
  assignDefined(payload, 'currency', pickFinanceString(flags, 'currency'));
  assignDefined(
    payload,
    'description',
    pickFinanceString(flags, 'description')
  );
  assignDefined(payload, 'icon', pickFinanceString(flags, 'icon'));
  assignDefined(payload, 'image_src', pickFinanceString(flags, 'image-src'));
  assignDefined(
    payload,
    'limit',
    parseFinanceNumber(pickFinanceString(flags, 'limit'))
  );
  assignDefined(
    payload,
    'payment_date',
    parseFinanceNumber(pickFinanceString(flags, 'payment-date'))
  );
  assignDefined(payload, 'report_opt_in', parseBoolean(flags['report-opt-in']));
  assignDefined(
    payload,
    'statement_date',
    parseFinanceNumber(pickFinanceString(flags, 'statement-date'))
  );
  assignDefined(payload, 'type', pickFinanceString(flags, 'type'));
  return mergePayload(payload, flags) as WalletPayload;
}

export function getTransactionPayload(flags: Record<string, FlagValue>) {
  const payload: Record<string, unknown> = {};
  const timeZone = pickCliTimeZone(flags);
  assignDefined(
    payload,
    'amount',
    parseFinanceNumber(pickFinanceString(flags, 'amount'))
  );
  assignDefined(
    payload,
    'description',
    pickFinanceString(flags, 'description')
  );
  assignDefined(
    payload,
    'origin_wallet_id',
    pickFinanceString(flags, 'wallet', 'wallet-id', 'origin-wallet-id')
  );
  assignDefined(payload, 'category_id', pickFinanceString(flags, 'category'));
  assignDefined(
    payload,
    'taken_at',
    normalizeCliDateTime(pickFinanceString(flags, 'taken-at', 'date'), timeZone)
  );
  assignDefined(payload, 'report_opt_in', parseBoolean(flags['report-opt-in']));
  assignDefined(payload, 'tag_ids', parseCsv(pickFinanceString(flags, 'tags')));
  assignDefined(
    payload,
    'is_amount_confidential',
    parseBoolean(flags['confidential-amount'])
  );
  assignDefined(
    payload,
    'is_description_confidential',
    parseBoolean(flags['confidential-description'])
  );
  assignDefined(
    payload,
    'is_category_confidential',
    parseBoolean(flags['confidential-category'])
  );
  return mergePayload(payload, flags) as TransactionPayload;
}

export function getCategoryPayload(
  flags: Record<string, FlagValue>,
  positionalName?: string
) {
  const payload: Record<string, unknown> = {};
  assignDefined(
    payload,
    'name',
    pickFinanceString(flags, 'name') || positionalName
  );
  assignDefined(payload, 'icon', pickFinanceString(flags, 'icon'));
  assignDefined(payload, 'color', pickFinanceString(flags, 'color'));
  assignDefined(
    payload,
    'description',
    pickFinanceString(flags, 'description')
  );
  assignDefined(payload, 'is_expense', parseBoolean(flags.expense));
  if (flags.income === true) payload.is_expense = false;
  return mergePayload(payload, flags) as TransactionCategoryPayload;
}

export function getTagPayload(
  flags: Record<string, FlagValue>,
  positionalName?: string
) {
  const payload: Record<string, unknown> = {};
  assignDefined(
    payload,
    'name',
    pickFinanceString(flags, 'name') || positionalName
  );
  assignDefined(payload, 'color', pickFinanceString(flags, 'color'));
  assignDefined(
    payload,
    'description',
    pickFinanceString(flags, 'description')
  );
  return mergePayload(payload, flags) as FinanceTagPayload;
}

export function getTransferPayload(
  flags: Record<string, FlagValue>,
  options: { includeTransactionIds: true }
): FinanceTransferUpdatePayload | FinanceTransferMigratePayload;
export function getTransferPayload(
  flags: Record<string, FlagValue>,
  options?: { includeTransactionIds?: false }
): FinanceTransferPayload;
export function getTransferPayload(
  flags: Record<string, FlagValue>,
  options: { includeTransactionIds?: boolean } = {}
) {
  const payload: Record<string, unknown> = {};
  const timeZone = pickCliTimeZone(flags);
  assignDefined(
    payload,
    'origin_wallet_id',
    pickFinanceString(
      flags,
      'origin-wallet',
      'origin-wallet-id',
      'from-wallet',
      'from-wallet-id'
    )
  );
  assignDefined(
    payload,
    'destination_wallet_id',
    pickFinanceString(
      flags,
      'destination-wallet',
      'destination-wallet-id',
      'to-wallet',
      'to-wallet-id'
    )
  );
  assignDefined(
    payload,
    'amount',
    parseFinanceNumber(pickFinanceString(flags, 'amount'))
  );
  assignDefined(
    payload,
    'destination_amount',
    parseFinanceNumber(
      pickFinanceString(flags, 'destination-amount', 'to-amount')
    )
  );
  assignDefined(
    payload,
    'description',
    pickFinanceString(flags, 'description')
  );
  assignDefined(
    payload,
    'taken_at',
    normalizeCliDateTime(pickFinanceString(flags, 'taken-at', 'date'), timeZone)
  );
  assignDefined(payload, 'report_opt_in', parseBoolean(flags['report-opt-in']));
  assignDefined(payload, 'tag_ids', parseCsv(pickFinanceString(flags, 'tags')));

  if (options.includeTransactionIds) {
    assignDefined(
      payload,
      'origin_transaction_id',
      pickFinanceString(
        flags,
        'origin-transaction',
        'origin-transaction-id',
        'from-transaction',
        'from-transaction-id'
      )
    );
    assignDefined(
      payload,
      'destination_transaction_id',
      pickFinanceString(
        flags,
        'destination-transaction',
        'destination-transaction-id',
        'to-transaction',
        'to-transaction-id'
      )
    );
  }

  const merged = mergePayload(payload, flags);
  return options.includeTransactionIds
    ? (merged as unknown as
        | FinanceTransferUpdatePayload
        | FinanceTransferMigratePayload)
    : (merged as unknown as FinanceTransferPayload);
}

export function getBudgetPayload(
  flags: Record<string, FlagValue>,
  positionalName?: string
) {
  const payload: Record<string, unknown> = {};
  assignDefined(
    payload,
    'name',
    pickFinanceString(flags, 'name') || positionalName
  );
  assignDefined(
    payload,
    'description',
    pickFinanceString(flags, 'description')
  );
  assignDefined(
    payload,
    'amount',
    parseFinanceNumber(pickFinanceString(flags, 'amount'))
  );
  assignDefined(payload, 'period', pickFinanceString(flags, 'period'));
  assignDefined(payload, 'start_date', pickFinanceString(flags, 'start-date'));
  assignDefined(payload, 'end_date', pickFinanceString(flags, 'end-date'));
  assignDefined(
    payload,
    'alert_threshold',
    parseFinanceNumber(pickFinanceString(flags, 'alert-threshold'))
  );
  assignDefined(payload, 'category_id', pickFinanceString(flags, 'category'));
  assignDefined(
    payload,
    'wallet_id',
    pickFinanceString(flags, 'wallet', 'wallet-id')
  );
  return mergePayload(payload, flags) as unknown as FinanceBudgetUpsertPayload;
}

export function getRecurringPayload(
  flags: Record<string, FlagValue>,
  positionalName?: string
) {
  const payload: Record<string, unknown> = {};
  assignDefined(
    payload,
    'name',
    pickFinanceString(flags, 'name') || positionalName
  );
  assignDefined(
    payload,
    'description',
    pickFinanceString(flags, 'description')
  );
  assignDefined(
    payload,
    'amount',
    parseFinanceNumber(pickFinanceString(flags, 'amount'))
  );
  assignDefined(
    payload,
    'wallet_id',
    pickFinanceString(flags, 'wallet', 'wallet-id')
  );
  assignDefined(payload, 'category_id', pickFinanceString(flags, 'category'));
  assignDefined(payload, 'frequency', pickFinanceString(flags, 'frequency'));
  assignDefined(payload, 'start_date', pickFinanceString(flags, 'start-date'));
  assignDefined(payload, 'end_date', pickFinanceString(flags, 'end-date'));
  return mergePayload(payload, flags) as unknown as RecurringTransactionPayload;
}

export function getTransactionListQuery(
  flags: Record<string, FlagValue>
): ListTransactionsQuery {
  const pagination = getFinancePagination(flags);

  return {
    includeCount: true,
    page: pagination.page,
    itemsPerPage: pagination.pageSize,
  };
}

export function getExportQuery(
  flags: Record<string, FlagValue>
): TransactionExportQuery {
  const pagination = getFinancePagination(flags);

  return {
    q: pickFinanceString(flags, 'q'),
    page: String(pagination.page),
    pageSize: String(pagination.pageSize),
    userIds: parseCsv(pickFinanceString(flags, 'users')),
    categoryIds: parseCsv(
      pickFinanceString(flags, 'categories', 'category-ids')
    ),
    walletIds: parseCsv(pickFinanceString(flags, 'wallets', 'wallet-ids')),
    tagIds: parseCsv(pickFinanceString(flags, 'tags', 'tag-ids')),
    transactionType: pickFinanceString(flags, 'type') as 'income' | 'expense',
    start: pickFinanceString(flags, 'start'),
    end: pickFinanceString(flags, 'end'),
  };
}

export function getMetricsQuery(flags: Record<string, FlagValue>) {
  return {
    start: pickFinanceString(flags, 'start'),
    end: pickFinanceString(flags, 'end'),
    walletId: pickFinanceString(flags, 'wallet', 'wallet-id'),
    categoryId: pickFinanceString(flags, 'category'),
  };
}

export function getCategoryBreakdownQuery(flags: Record<string, FlagValue>) {
  return {
    walletId: pickFinanceString(flags, 'wallet', 'wallet-id'),
    startDate: pickFinanceString(flags, 'start-date', 'start'),
    endDate: pickFinanceString(flags, 'end-date', 'end'),
    type: pickFinanceString(flags, 'type'),
    timezone: pickFinanceString(flags, 'timezone'),
  };
}

export function getSpendingTrendsQuery(flags: Record<string, FlagValue>) {
  return {
    days: pickFinanceString(flags, 'days'),
  };
}
