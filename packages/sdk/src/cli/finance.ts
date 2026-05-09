import type { TuturuuuUserClient } from '../platform';
import type { FlagValue } from './args';
import {
  getBudgetPayload,
  getCategoryBreakdownQuery,
  getCategoryPayload,
  getExportQuery,
  getFinancePositionalName,
  getMetricsQuery,
  getSpendingTrendsQuery,
  getTransactionListQuery,
  getTransactionPayload,
  getWalletPayload,
} from './finance-payloads';
import { handleRecurring } from './finance-recurring';
import { render } from './render';

export interface FinanceCommandInput {
  client: TuturuuuUserClient;
  flags: Record<string, FlagValue>;
  json: boolean;
  positionals: string[];
  workspaceId: string;
}

export type FinanceResource =
  | 'budgets'
  | 'categories'
  | 'recurring'
  | 'transactions'
  | 'wallets';

function normalizeResource(value?: string): FinanceResource | undefined {
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
    case 'transaction':
    case 'transactions':
      return 'transactions';
    case 'wallet':
    case 'wallets':
      return 'wallets';
    default:
      return undefined;
  }
}

export function getRequiredId(
  action: string,
  resource: FinanceResource,
  id?: string
) {
  if (id) return id;
  throw new Error(`Missing ${resource.slice(0, -1)} id for finance ${action}.`);
}

async function handleWallets(input: FinanceCommandInput, action: string) {
  const { client, flags, json, positionals, workspaceId } = input;
  const id = positionals[3];

  if (action === 'list') {
    render(await client.finance.listWallets(workspaceId), {
      financeResource: 'wallets',
      group: 'finance',
      json,
    });
    return;
  }
  if (action === 'get') {
    render(
      await client.finance.getWallet(
        workspaceId,
        getRequiredId(action, 'wallets', id)
      ),
      {
        financeResource: 'wallets',
        group: 'finance',
        json,
      }
    );
    return;
  }
  if (action === 'create') {
    render(
      await client.finance.createWallet(
        workspaceId,
        getWalletPayload(flags, getFinancePositionalName(positionals))
      ),
      { financeResource: 'wallets', group: 'finance', json }
    );
    return;
  }
  if (action === 'update') {
    render(
      await client.finance.updateWallet(
        workspaceId,
        getRequiredId(action, 'wallets', id),
        getWalletPayload(flags)
      ),
      { financeResource: 'wallets', group: 'finance', json }
    );
    return;
  }
  if (action === 'delete') {
    render(
      await client.finance.deleteWallet(
        workspaceId,
        getRequiredId(action, 'wallets', id)
      ),
      { financeResource: 'wallets', group: 'finance', json }
    );
    return;
  }
  throw new Error(`Unknown finance wallets action: ${action}`);
}

async function handleTransactions(input: FinanceCommandInput, action: string) {
  const { client, flags, json, positionals, workspaceId } = input;
  const id = positionals[3];

  if (action === 'list') {
    render(
      await client.finance.listTransactions(
        workspaceId,
        getTransactionListQuery(flags)
      ),
      {
        financeResource: 'transactions',
        group: 'finance',
        json,
      }
    );
    return;
  }
  if (action === 'export') {
    render(
      await client.finance.listTransactionExportRows(
        workspaceId,
        getExportQuery(flags)
      ),
      {
        financeResource: 'transactions',
        group: 'finance',
        json,
      }
    );
    return;
  }
  if (action === 'stats') {
    render(
      await client.finance.getTransactionStats(
        workspaceId,
        getMetricsQuery(flags)
      ),
      {
        financeResource: 'stats',
        group: 'finance',
        json,
      }
    );
    return;
  }
  if (action === 'category-breakdown') {
    render(
      await client.finance.getCategoryBreakdown(
        workspaceId,
        getCategoryBreakdownQuery(flags)
      ),
      {
        financeResource: 'category-breakdown',
        group: 'finance',
        json,
      }
    );
    return;
  }
  if (action === 'spending-trends') {
    render(
      await client.finance.getSpendingTrends(
        workspaceId,
        getSpendingTrendsQuery(flags)
      ),
      {
        financeResource: 'spending-trends',
        group: 'finance',
        json,
      }
    );
    return;
  }
  if (action === 'get') {
    render(
      await client.finance.getTransaction(
        workspaceId,
        getRequiredId(action, 'transactions', id)
      ),
      { financeResource: 'transactions', group: 'finance', json }
    );
    return;
  }
  if (action === 'create') {
    render(
      await client.finance.createTransaction(
        workspaceId,
        getTransactionPayload(flags)
      ),
      {
        financeResource: 'transactions',
        group: 'finance',
        json,
      }
    );
    return;
  }
  if (action === 'update') {
    render(
      await client.finance.updateTransaction(
        workspaceId,
        getRequiredId(action, 'transactions', id),
        getTransactionPayload(flags)
      ),
      { financeResource: 'transactions', group: 'finance', json }
    );
    return;
  }
  if (action === 'delete') {
    render(
      await client.finance.deleteTransaction(
        workspaceId,
        getRequiredId(action, 'transactions', id)
      ),
      { financeResource: 'transactions', group: 'finance', json }
    );
    return;
  }
  throw new Error(`Unknown finance transactions action: ${action}`);
}

async function handleCategories(input: FinanceCommandInput, action: string) {
  const { client, flags, json, positionals, workspaceId } = input;
  const id = positionals[3];

  if (action === 'list') {
    render(await client.finance.listTransactionCategories(workspaceId), {
      financeResource: 'categories',
      group: 'finance',
      json,
    });
    return;
  }
  if (action === 'get') {
    render(
      await client.finance.getTransactionCategory(
        workspaceId,
        getRequiredId(action, 'categories', id)
      ),
      {
        financeResource: 'categories',
        group: 'finance',
        json,
      }
    );
    return;
  }
  if (action === 'create') {
    render(
      await client.finance.createTransactionCategory(
        workspaceId,
        getCategoryPayload(flags, getFinancePositionalName(positionals))
      ),
      { financeResource: 'categories', group: 'finance', json }
    );
    return;
  }
  if (action === 'update') {
    render(
      await client.finance.updateTransactionCategory(
        workspaceId,
        getRequiredId(action, 'categories', id),
        getCategoryPayload(flags)
      ),
      { financeResource: 'categories', group: 'finance', json }
    );
    return;
  }
  if (action === 'delete') {
    render(
      await client.finance.deleteTransactionCategory(
        workspaceId,
        getRequiredId(action, 'categories', id)
      ),
      { financeResource: 'categories', group: 'finance', json }
    );
    return;
  }
  throw new Error(`Unknown finance categories action: ${action}`);
}

async function handleBudgets(input: FinanceCommandInput, action: string) {
  const { client, flags, json, positionals, workspaceId } = input;
  const id = positionals[3];

  if (action === 'list') {
    render(await client.finance.listBudgets(workspaceId), {
      financeResource: 'budgets',
      group: 'finance',
      json,
    });
    return;
  }
  if (action === 'status') {
    render(await client.finance.getBudgetStatus(workspaceId), {
      financeResource: 'budget-status',
      group: 'finance',
      json,
    });
    return;
  }
  if (action === 'create') {
    render(
      await client.finance.createBudget(
        workspaceId,
        getBudgetPayload(flags, getFinancePositionalName(positionals))
      ),
      { financeResource: 'budgets', group: 'finance', json }
    );
    return;
  }
  if (action === 'update') {
    render(
      await client.finance.updateBudget(
        workspaceId,
        getRequiredId(action, 'budgets', id),
        getBudgetPayload(flags)
      ),
      { financeResource: 'budgets', group: 'finance', json }
    );
    return;
  }
  if (action === 'delete') {
    render(
      await client.finance.deleteBudget(
        workspaceId,
        getRequiredId(action, 'budgets', id)
      ),
      { financeResource: 'budgets', group: 'finance', json }
    );
    return;
  }
  throw new Error(`Unknown finance budgets action: ${action}`);
}

export async function runFinanceCommand(input: FinanceCommandInput) {
  const resource = normalizeResource(input.positionals[1]);
  const action = input.positionals[2] || 'list';

  if (!resource) {
    throw new Error(
      'Missing finance resource. Use wallets, transactions, categories, budgets, or recurring.'
    );
  }

  switch (resource) {
    case 'budgets':
      return handleBudgets(input, action);
    case 'categories':
      return handleCategories(input, action);
    case 'recurring':
      return handleRecurring(input, action);
    case 'transactions':
      return handleTransactions(input, action);
    case 'wallets':
      return handleWallets(input, action);
    default:
      throw new Error(`Unknown finance resource: ${resource}`);
  }
}
