import type { TablesInsert, TablesUpdate } from '@tuturuuu/types';
import { z } from 'zod';
import type { MiraToolContext } from '../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../workspace-context';

const createWalletArgsSchema = z.object({
  name: z.string().trim().min(1),
  currency: z.string().trim().min(1).optional(),
  balance: z.coerce.number().optional(),
  type: z.string().trim().min(1).optional(),
});

const updateWalletArgsSchema = z
  .object({
    walletId: z.string().uuid(),
    name: z.string().trim().min(1).optional(),
    currency: z.string().trim().min(1).optional(),
    balance: z.coerce.number().optional(),
    type: z.string().trim().min(1).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.currency !== undefined ||
      value.balance !== undefined ||
      value.type !== undefined,
    { message: 'At least one field to update is required' }
  );

const createTransactionTagArgsSchema = z.object({
  name: z.string().trim().min(1),
  color: z
    .string()
    .regex(/^[#][0-9a-fA-F]{3,8}$/)
    .optional(),
  description: z.string().trim().optional(),
});

const updateTransactionTagArgsSchema = z
  .object({
    tagId: z.string().uuid(),
    name: z.string().trim().min(1).optional(),
    color: z
      .string()
      .regex(/^[#][0-9a-fA-F]{3,8}$/)
      .optional(),
    description: z.string().trim().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.color !== undefined ||
      value.description !== undefined,
    { message: 'At least one field to update is required' }
  );

// ── Workspace default currency ──

export async function executeSetDefaultCurrency(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const currency = (args.currency as string).toUpperCase();
  const workspaceId = getWorkspaceContextWorkspaceId(ctx);

  const { error } = await ctx.supabase.from('workspace_configs').upsert(
    {
      id: 'DEFAULT_CURRENCY',
      ws_id: workspaceId,
      value: currency,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'ws_id,id' }
  );

  if (error) return { error: error.message };
  return {
    success: true,
    message: `Default workspace currency set to ${currency}`,
    currency,
  };
}

export async function executeLogTransaction(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const amount = args.amount as number;
  let walletId = args.walletId as string | null;

  if (!walletId) {
    const { data: wallet } = await ctx.supabase
      .from('workspace_wallets')
      .select('id')
      .eq('ws_id', getWorkspaceContextWorkspaceId(ctx))
      .limit(1)
      .single();

    if (!wallet) return { error: 'No wallet found in workspace' };
    walletId = wallet.id;
  }

  const { data: tx, error } = await ctx.supabase
    .from('wallet_transactions')
    .insert({
      amount,
      description: (args.description as string) ?? null,
      wallet_id: walletId,
      taken_at: new Date().toISOString(),
    })
    .select('id, amount, description, taken_at')
    .single();

  if (error) return { error: error.message };
  return {
    success: true,
    message: `Transaction of ${amount} logged`,
    transaction: tx,
  };
}

export async function executeGetSpendingSummary(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const days = (args.days as number) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data: wallets } = await ctx.supabase
    .from('workspace_wallets')
    .select('id, name, currency, balance')
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));

  if (!wallets?.length)
    return { wallets: [], totalIncome: 0, totalExpenses: 0, net: 0 };

  type Wallet = { id: string; name: string; currency: string; balance: number };
  const walletIds = (wallets as Wallet[]).map((w) => w.id);

  const { data: transactions } = await ctx.supabase
    .from('wallet_transactions')
    .select('amount, wallet_id')
    .in('wallet_id', walletIds)
    .gte('taken_at', since.toISOString());

  let totalIncome = 0;
  let totalExpenses = 0;

  for (const tx of transactions || []) {
    if (tx.amount && tx.amount > 0) totalIncome += tx.amount;
    else if (tx.amount && tx.amount < 0) totalExpenses += Math.abs(tx.amount);
  }

  return {
    period: `Last ${days} days`,
    totalIncome,
    totalExpenses,
    net: totalIncome - totalExpenses,
    wallets: (wallets as Wallet[]).map((w) => ({
      id: w.id,
      name: w.name,
      currency: w.currency,
      balance: w.balance,
    })),
  };
}

// ── New CRUD tools ──

export async function executeListWallets(
  _args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const { data, error } = await ctx.supabase
    .from('workspace_wallets')
    .select('id, name, currency, balance, type, created_at')
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx))
    .order('created_at', { ascending: true });

  if (error) return { error: error.message };
  return { count: data?.length ?? 0, wallets: data ?? [] };
}

export async function executeCreateWallet(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const parsed = createWalletArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid wallet data' };
  }

  const validated = parsed.data;
  const insertData: TablesInsert<'workspace_wallets'> = {
    name: validated.name,
    ws_id: getWorkspaceContextWorkspaceId(ctx),
  };
  if (validated.currency) insertData.currency = validated.currency;
  if (validated.balance !== undefined) insertData.balance = validated.balance;
  if (validated.type) insertData.type = validated.type;

  const { data, error } = await ctx.supabase
    .from('workspace_wallets')
    .insert(insertData)
    .select('id, name, currency, balance')
    .single();

  if (error) return { error: error.message };
  return {
    success: true,
    message: `Wallet "${validated.name}" created`,
    wallet: data,
  };
}

export async function executeUpdateWallet(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const parsed = updateWalletArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid wallet data' };
  }

  const validated = parsed.data;
  const walletId = validated.walletId;
  const updates: TablesUpdate<'workspace_wallets'> = {};

  if (validated.name !== undefined) updates.name = validated.name;
  if (validated.currency !== undefined) updates.currency = validated.currency;
  if (validated.balance !== undefined) updates.balance = validated.balance;
  if (validated.type !== undefined) updates.type = validated.type;

  const { error } = await ctx.supabase
    .from('workspace_wallets')
    .update(updates)
    .eq('id', walletId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));

  if (error) return { error: error.message };
  return { success: true, message: `Wallet ${walletId} updated` };
}

export async function executeDeleteWallet(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const walletId = args.walletId as string;

  const { error } = await ctx.supabase
    .from('workspace_wallets')
    .delete()
    .eq('id', walletId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));

  if (error) return { error: error.message };
  return { success: true, message: `Wallet ${walletId} deleted` };
}

export async function executeListTransactions(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const limit = (args.limit as number) || 50;

  // Get all wallet IDs in workspace to scope query
  const { data: wallets } = await ctx.supabase
    .from('workspace_wallets')
    .select('id')
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));

  if (!wallets?.length) return { count: 0, transactions: [] };

  const walletIds = wallets.map((w: { id: string }) => w.id);

  let query = ctx.supabase
    .from('wallet_transactions')
    .select('id, amount, description, taken_at, wallet_id, category_id')
    .in('wallet_id', walletIds)
    .order('taken_at', { ascending: false })
    .limit(limit);

  if (args.walletId) query = query.eq('wallet_id', args.walletId as string);
  if (args.categoryId)
    query = query.eq('category_id', args.categoryId as string);
  if (args.days) {
    const since = new Date();
    since.setDate(since.getDate() - (args.days as number));
    query = query.gte('taken_at', since.toISOString());
  }

  const { data, error } = await query;

  if (error) return { error: error.message };
  return { count: data?.length ?? 0, transactions: data ?? [] };
}

export async function executeGetTransaction(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const transactionId = args.transactionId as string;

  const { data: wallets } = await ctx.supabase
    .from('workspace_wallets')
    .select('id')
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));
  const walletIds = wallets?.map((w) => w.id) ?? [];

  if (!walletIds.length) return { error: 'No wallets in workspace' };

  const { data, error } = await ctx.supabase
    .from('wallet_transactions')
    .select('id, amount, description, taken_at, wallet_id, category_id')
    .eq('id', transactionId)
    .in('wallet_id', walletIds)
    .single();

  if (error) return { error: error.message };
  return { transaction: data };
}

export async function executeUpdateTransaction(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const transactionId = args.transactionId as string;
  const updates: Record<string, unknown> = {};

  if (args.amount !== undefined) updates.amount = args.amount;
  if (args.description !== undefined) updates.description = args.description;
  if (args.categoryId !== undefined) updates.category_id = args.categoryId;
  if (args.walletId !== undefined) updates.wallet_id = args.walletId;

  if (Object.keys(updates).length === 0) {
    return { success: true, message: 'No fields to update' };
  }

  const { data: wallets } = await ctx.supabase
    .from('workspace_wallets')
    .select('id')
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));
  const walletIds = wallets?.map((w) => w.id) ?? [];

  if (!walletIds.length) return { error: 'No wallets in workspace' };

  const { error } = await ctx.supabase
    .from('wallet_transactions')
    .update(updates)
    .eq('id', transactionId)
    .in('wallet_id', walletIds);

  if (error) return { error: error.message };
  return { success: true, message: `Transaction ${transactionId} updated` };
}

export async function executeDeleteTransaction(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const transactionId = args.transactionId as string;

  const { data: wallets } = await ctx.supabase
    .from('workspace_wallets')
    .select('id')
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));
  const walletIds = wallets?.map((w) => w.id) ?? [];

  if (!walletIds.length) return { error: 'No wallets in workspace' };

  const { error } = await ctx.supabase
    .from('wallet_transactions')
    .delete()
    .eq('id', transactionId)
    .in('wallet_id', walletIds);

  if (error) return { error: error.message };
  return { success: true, message: `Transaction ${transactionId} deleted` };
}

export async function executeListTransactionCategories(
  _args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const { data, error } = await ctx.supabase
    .from('transaction_categories')
    .select('id, name, is_expense, ws_id')
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));

  if (error) return { error: error.message };
  return { count: data?.length ?? 0, categories: data ?? [] };
}

export async function executeCreateTransactionCategory(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const { data, error } = await ctx.supabase
    .from('transaction_categories')
    .insert({
      name: args.name as string,
      is_expense: (args.isExpense as boolean) ?? true,
      ws_id: getWorkspaceContextWorkspaceId(ctx),
    })
    .select('id, name, is_expense')
    .single();

  if (error) return { error: error.message };
  return {
    success: true,
    message: `Category "${args.name}" created`,
    category: data,
  };
}

export async function executeUpdateTransactionCategory(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const categoryId = args.categoryId as string;
  const updates: Record<string, unknown> = {};

  if (args.name !== undefined) updates.name = args.name;
  if (args.isExpense !== undefined) updates.is_expense = args.isExpense;

  if (Object.keys(updates).length === 0) {
    return { success: true, message: 'No fields to update' };
  }

  const { error } = await ctx.supabase
    .from('transaction_categories')
    .update(updates)
    .eq('id', categoryId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));

  if (error) return { error: error.message };
  return { success: true, message: `Category ${categoryId} updated` };
}

export async function executeDeleteTransactionCategory(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const categoryId = args.categoryId as string;

  const { error } = await ctx.supabase
    .from('transaction_categories')
    .delete()
    .eq('id', categoryId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));

  if (error) return { error: error.message };
  return { success: true, message: `Category ${categoryId} deleted` };
}

export async function executeListTransactionTags(
  _args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const { data, error } = await ctx.supabase
    .from('transaction_tags')
    .select('id, name, color, description, ws_id')
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));

  if (error) return { error: error.message };
  return { count: data?.length ?? 0, tags: data ?? [] };
}

export async function executeCreateTransactionTag(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const parsed = createTransactionTagArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Invalid transaction tag data',
    };
  }

  const validated = parsed.data;
  const insertData: TablesInsert<'transaction_tags'> = {
    name: validated.name,
    ws_id: getWorkspaceContextWorkspaceId(ctx),
  };
  if (validated.color) insertData.color = validated.color;
  if (validated.description) insertData.description = validated.description;

  const { data, error } = await ctx.supabase
    .from('transaction_tags')
    .insert(insertData)
    .select('id, name, color')
    .single();

  if (error) return { error: error.message };
  return {
    success: true,
    message: `Tag "${validated.name}" created`,
    tag: data,
  };
}

export async function executeUpdateTransactionTag(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const parsed = updateTransactionTagArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Invalid transaction tag data',
    };
  }

  const validated = parsed.data;
  const tagId = validated.tagId;
  const updates: TablesUpdate<'transaction_tags'> = {};

  if (validated.name !== undefined) updates.name = validated.name;
  if (validated.color !== undefined) updates.color = validated.color;
  if (validated.description !== undefined)
    updates.description = validated.description;

  const { error } = await ctx.supabase
    .from('transaction_tags')
    .update(updates)
    .eq('id', tagId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));

  if (error) return { error: error.message };
  return { success: true, message: `Tag ${tagId} updated` };
}

export async function executeDeleteTransactionTag(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const tagId = args.tagId as string;

  const { error } = await ctx.supabase
    .from('transaction_tags')
    .delete()
    .eq('id', tagId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));

  if (error) return { error: error.message };
  return { success: true, message: `Tag ${tagId} deleted` };
}
