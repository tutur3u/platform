export type FinanceResource =
  | 'budgets'
  | 'categories'
  | 'recurring'
  | 'tags'
  | 'transfers'
  | 'transactions'
  | 'wallets';

export function normalizeFinanceResource(
  value?: string
): FinanceResource | undefined {
  switch (value) {
    case 'budget':
    case 'budgets':
      return 'budgets';
    case 'category':
    case 'categories':
      return 'categories';
    case 'recurring':
    case 'recurring-transaction':
    case 'recurring-transactions':
      return 'recurring';
    case 'tag':
    case 'tags':
      return 'tags';
    case 'transaction':
    case 'transactions':
      return 'transactions';
    case 'transfer':
    case 'transfers':
      return 'transfers';
    case 'wallet':
    case 'wallets':
      return 'wallets';
    default:
      return undefined;
  }
}

export function getRequiredFinanceId(
  action: string,
  resource: FinanceResource,
  id?: string
) {
  if (id) return id;
  throw new Error(`Missing ${resource.slice(0, -1)} id for finance ${action}.`);
}
