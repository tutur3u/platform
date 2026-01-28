import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';

export const useTransactionCategories = (wsId: string) => {
  return useQuery({
    queryKey: ['transaction-categories', wsId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('transaction_categories')
        .select('*')
        .eq('ws_id', wsId)
        .order('name', { ascending: true });

      if (error) throw error;
      return data as TransactionCategory[];
    },
  });
};
