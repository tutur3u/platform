import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';

export const useWallets = (wsId: string) => {
  return useQuery({
    queryKey: ['wallets', wsId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_wallets')
        .select('*')
        .eq('ws_id', wsId)
        .order('name', { ascending: true });

      if (error) throw error;
      return data as Wallet[];
    },
  });
};
