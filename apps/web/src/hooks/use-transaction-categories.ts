import { useQuery } from '@tanstack/react-query';
import { listTransactionCategories } from '@tuturuuu/internal-api/finance';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';

export const useTransactionCategories = (wsId: string) => {
  return useQuery({
    queryKey: ['transaction-categories', wsId],
    queryFn: async () => {
      return (await listTransactionCategories(wsId)) as TransactionCategory[];
    },
  });
};
