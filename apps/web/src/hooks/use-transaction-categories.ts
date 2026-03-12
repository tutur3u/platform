import { useQuery } from '@tanstack/react-query';
import { listTransactionCategories } from '@tuturuuu/internal-api/finance';
import type { TransactionCategoryWithStats } from '@tuturuuu/types/primitives/TransactionCategory';

export const useTransactionCategories = (wsId: string) => {
  return useQuery({
    queryKey: ['transaction-categories', wsId],
    queryFn: async (): Promise<TransactionCategoryWithStats[]> =>
      listTransactionCategories(wsId),
  });
};
