import { useQuery } from '@tanstack/react-query';
import { listWallets } from '@tuturuuu/internal-api/finance';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';

export const useWallets = (wsId: string) => {
  return useQuery({
    queryKey: ['wallets', wsId],
    queryFn: async () => {
      return (await listWallets(wsId)) as Wallet[];
    },
  });
};
