import { useQuery } from '@tanstack/react-query';
import { listWallets } from '@tuturuuu/internal-api/finance';
import type { Wallet } from '@tuturuuu/types';

export const useWallets = (wsId: string) => {
  return useQuery({
    queryKey: ['wallets', wsId],
    queryFn: async (): Promise<Wallet[]> => listWallets(wsId),
  });
};
