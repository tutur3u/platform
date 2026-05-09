import type { TuturuuuUserClient } from '../platform';
import type { FlagValue } from './args';
import { paginateFinanceArray } from './finance-pagination';
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
import {
  getRequiredFinanceId,
  normalizeFinanceResource,
} from './finance-resources';
import { render } from './render';

export interface FinanceCommandInput {
  client: TuturuuuUserClient;
  flags: Record<string, FlagValue>;
  json: boolean;
  positionals: string[];
  workspaceId: string;
}

async function handleWallets(input: FinanceCommandInput, action: string) {
  const { client, flags, json, positionals, workspaceId } = input;
  const id = positionals[3];

  if (action === 'list') {
    render(
      paginateFinanceArray(
        await client.finance.listWallets(workspaceId),
        flags
      ),
      {
        financeResource: 'wallets',
        group: 'finance',
        json,
      }
    );
    return;
  }
  if (action === 'get') {
    render(
      await client.finance.getWallet(
        workspaceId,
        getRequiredFinanceId(action, 'wallets', id)
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
        getRequiredFinanceId(action, 'wallets', id),
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
        getRequiredFinanceId(action, 'wallets', id)
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
        getRequiredFinanceId(action, 'transactions', id)
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
        getRequiredFinanceId(action, 'transactions', id),
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
        getRequiredFinanceId(action, 'transactions', id)
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
    render(
      paginateFinanceArray(
        await client.finance.listTransactionCategories(workspaceId),
        flags
      ),
      {
        financeResource: 'categories',
        group: 'finance',
        json,
      }
    );
    return;
  }
  if (action === 'get') {
    render(
      await client.finance.getTransactionCategory(
        workspaceId,
        getRequiredFinanceId(action, 'categories', id)
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
        getRequiredFinanceId(action, 'categories', id),
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
        getRequiredFinanceId(action, 'categories', id)
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
    render(
      paginateFinanceArray(
        await client.finance.listBudgets(workspaceId),
        flags
      ),
      {
        financeResource: 'budgets',
        group: 'finance',
        json,
      }
    );
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
        getRequiredFinanceId(action, 'budgets', id),
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
        getRequiredFinanceId(action, 'budgets', id)
      ),
      { financeResource: 'budgets', group: 'finance', json }
    );
    return;
  }
  throw new Error(`Unknown finance budgets action: ${action}`);
}

export async function runFinanceCommand(input: FinanceCommandInput) {
  const resource = normalizeFinanceResource(input.positionals[1]);
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
