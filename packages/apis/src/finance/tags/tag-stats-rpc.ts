import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export type TransactionTagStatsRpcRow = {
  tag_id: string;
  tag_name: string;
  tag_color: string;
  tag_description: string | null;
  ws_id: string;
  transaction_count: number;
  income_count: number;
  expense_count: number;
  total_amount: number;
  total_income: number;
  total_expense: number;
  net_total: number;
  recent_transaction_count: number;
  recent_income_count: number;
  recent_expense_count: number;
  recent_total_income: number;
  recent_total_expense: number;
  last_transaction_at: string | null;
};

type PrivateTransactionTagStatsClient = {
  schema(schema: 'private'): {
    rpc(
      fn: 'get_transaction_tag_stats',
      args: {
        _actor_id: string;
        _ws_id: string;
      }
    ): Promise<{
      data: TransactionTagStatsRpcRow[] | null;
      error: { message?: string } | null;
    }>;
  };
};

export function getTransactionTagStats(
  sbAdmin: TypedSupabaseClient,
  {
    actorId,
    wsId,
  }: {
    actorId: string;
    wsId: string;
  }
) {
  return (sbAdmin as unknown as PrivateTransactionTagStatsClient)
    .schema('private')
    .rpc('get_transaction_tag_stats', {
      _actor_id: actorId,
      _ws_id: wsId,
    });
}
