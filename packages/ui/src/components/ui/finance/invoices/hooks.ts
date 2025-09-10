import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import type { Invoice } from '@tuturuuu/types/primitives/Invoice';
import type { Product, Promotion } from './types';

// React Query hooks for data fetching
export const useUsers = (wsId: string) => {
  return useQuery({
    queryKey: ['users', wsId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_users')
        .select('*')
        .eq('ws_id', wsId)
        .order('full_name', { ascending: true });

      if (error) throw error;
      return data as WorkspaceUser[];
    },
  });
};

export const useProducts = (wsId: string) => {
  return useQuery({
    queryKey: ['products', wsId],
    queryFn: async () => {
      const supabase = createClient();
      const { data: rawData, error } = await supabase
        .from('workspace_products')
        .select(
          '*, product_categories(name), inventory_products!inventory_products_product_id_fkey(amount, min_amount, price, unit_id, warehouse_id, inventory_warehouses!inventory_products_warehouse_id_fkey(name), inventory_units!inventory_products_unit_id_fkey(name))'
        )
        .eq('ws_id', wsId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const data = rawData.map((item) => ({
        id: item.id,
        name: item.name,
        manufacturer: item.manufacturer,
        description: item.description,
        usage: item.usage,
        category: item.product_categories?.name,
        category_id: item.category_id,
        ws_id: item.ws_id,
        created_at: item.created_at,
        inventory: (item.inventory_products || []).map((inventory) => ({
          unit_id: inventory.unit_id,
          warehouse_id: inventory.warehouse_id,
          amount: inventory.amount,
          min_amount: inventory.min_amount || 0,
          price: inventory.price || 0,
          unit_name: inventory.inventory_units?.name || null,
          warehouse_name: inventory.inventory_warehouses?.name || null,
        })),
      }));

      return data as Product[];
    },
  });
};

export const usePromotions = (wsId: string) => {
  return useQuery({
    queryKey: ['promotions', wsId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_promotions')
        .select('*')
        .eq('ws_id', wsId)
        .order('code', { ascending: true });

      if (error) throw error;
      return data as Promotion[];
    },
  });
};

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

export const useCategories = (wsId: string) => {
  return useQuery({
    queryKey: ['categories', wsId],
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

export const useUserTransactions = (wsId: string, userId: string) => {
  return useQuery({
    queryKey: ['user-transactions', wsId, userId],
    queryFn: async () => {
      const supabase = createClient();
      const { data: rawData, error } = await supabase
        .from('wallet_transactions')
        .select(
          `*, workspace_wallets!inner(name, ws_id), transaction_categories(name)`
        )
        .eq('workspace_wallets.ws_id', wsId)
        .eq('creator_id', userId)
        .order('taken_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      const data =
        rawData?.map(
          ({ workspace_wallets, transaction_categories, ...rest }) => ({
            ...rest,
            wallet: workspace_wallets?.name,
            category: transaction_categories?.name,
          })
        ) || [];

      return data as Transaction[];
    },
    enabled: !!userId,
  });
};

export const useUserInvoices = (wsId: string, userId: string) => {
  return useQuery({
    queryKey: ['user-invoices', wsId, userId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('finance_invoices')
        .select('*')
        .eq('ws_id', wsId)
        .eq('customer_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Invoice[];
    },
    enabled: !!userId,
  });
};

// Subscription-specific hooks
export const useUserGroups = (userId: string) => {
  return useQuery({
    queryKey: ['user-groups', userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_user_groups_users')
        .select('workspace_user_groups(*)')
        .eq('role', 'STUDENT')
        .eq('user_id', userId);

      if (error) {
        console.error('❌ User groups fetch error:', error);
        throw error;
      }
      
      return data || [];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 3,
  });
};

export const useUserAttendance = (groupId: string, userId: string, month: string) => {
  return useQuery({
    queryKey: ['user-attendance', groupId, userId, month],
    queryFn: async () => {
      const supabase = createClient();
      
      // Parse the month to get start and end dates
      const startOfMonth = new Date(month + '-01');
      const nextMonth = new Date(startOfMonth);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      
      const { data, error } = await supabase.from('user_group_attendance')
        .select('date')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .lt('date', nextMonth.toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) {
        console.error('❌ User attendance fetch error:', error);
        throw error;
      }
      
      return data || [];
    },
    enabled: !!groupId && !!userId && !!month,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 3,
  });
};

// Get User's Group Products with improved caching
export const useUserGroupProducts = (groupId: string) => {
  return useQuery({
    queryKey: ['user-group-products', groupId],
    queryFn: async () => {
      const supabase = createClient();
        
      const { data, error } = await supabase.from('user_group_linked_products')
        .select('workspace_products(id, name, product_categories(name)), inventory_units(name)')
        .eq('group_id', groupId);

      if (error) {
        console.error('❌ Group products fetch error:', error);
        throw error;
      }
      
      return data || [];
    },
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 3,
  });
};
