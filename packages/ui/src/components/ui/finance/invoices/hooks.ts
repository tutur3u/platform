import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Database } from '@tuturuuu/types';
import type { Invoice } from '@tuturuuu/types/primitives/Invoice';
import type { PendingInvoice } from '@tuturuuu/types/primitives/PendingInvoice';
import { parseMonthsOwed } from '@tuturuuu/types/primitives/PendingInvoice';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { z } from 'zod';
import type { Product, Promotion, UserGroupProducts } from './types';

// ==================== ZOD SCHEMAS ====================

const invoiceSchema = z.object({
  id: z.string(),
  price: z
    .number()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  total_diff: z
    .number()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  note: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  notice: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  customer_id: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  customer: z
    .object({
      full_name: z.string().nullable().optional(),
      display_name: z.string().nullable().optional(),
      avatar_url: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  creator_id: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  creator: z
    .object({
      id: z.string(),
      full_name: z.string().nullable().optional(),
      display_name: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      avatar_url: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  platform_creator_id: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  wallet: z
    .object({
      name: z.string().nullable(),
    })
    .nullable()
    .optional(),
  ws_id: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  completed_at: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  transaction_id: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  created_at: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  href: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
});

type FinanceInvoiceRow =
  Database['public']['Tables']['finance_invoices']['Row'];
type FinanceInvoiceUserGroupRow = {
  finance_invoices: Pick<
    FinanceInvoiceRow,
    'valid_until' | 'created_at'
  > | null;
};

const invoicesResponseSchema = z.object({
  data: z.array(invoiceSchema),
  count: z.number(),
});

const createdPromotionSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  code: z.string().nullable(),
  value: z.number(),
  use_ratio: z.boolean(),
  max_uses: z.number().nullable(),
  current_uses: z.number(),
});

const createdPromotionResponseSchema = z.object({
  data: createdPromotionSchema,
});

const pendingInvoiceRawSchema = z.object({
  user_id: z.string(),
  user_name: z.string(),
  user_avatar_url: z.string().optional().nullable(),
  group_id: z.string().optional(),
  group_name: z.string().optional(),
  group_ids: z.array(z.string()).optional(),
  group_names: z.array(z.string()).optional(),
  months_owed: z.union([z.string(), z.array(z.string())]),
  attendance_days: z.number(),
  total_sessions: z.number(),
  potential_total: z.number(),
  href: z.string().optional().nullable(),
  ws_id: z.string().optional().nullable(),
});

const pendingInvoicesRawSchema = z.array(pendingInvoiceRawSchema);

// ==================== INVOICES DATA FETCHING ====================

export interface InvoicesParams {
  q?: string;
  page?: number;
  pageSize?: number;
  start?: string;
  end?: string;
  userIds?: string[];
  walletIds?: string[];
}

export interface InvoicesResponse {
  data: Invoice[];
  count: number;
}

/**
 * Fetch workspace invoices with search, filter and pagination support
 * Uses API route for client-side data fetching with proper caching
 */
export function useWorkspaceInvoices(
  wsId: string,
  params: InvoicesParams = {},
  options?: {
    enabled?: boolean;
    initialData?: InvoicesResponse;
  }
) {
  const {
    q = '',
    page = 1,
    pageSize = 10,
    start,
    end,
    userIds = [],
    walletIds = [],
  } = params;

  return useQuery({
    queryKey: [
      'workspace-invoices',
      wsId,
      { q, page, pageSize, start, end, userIds, walletIds },
    ],
    queryFn: async (): Promise<InvoicesResponse> => {
      const searchParams = new URLSearchParams();

      if (q) searchParams.set('q', q);
      searchParams.set('page', String(page));
      searchParams.set('pageSize', String(pageSize));
      if (start) searchParams.set('start', start);
      if (end) searchParams.set('end', end);

      userIds.forEach((userId) => {
        searchParams.append('userIds', userId);
      });

      walletIds.forEach((walletId) => {
        searchParams.append('walletIds', walletId);
      });

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/finance/invoices?${searchParams.toString()}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch workspace invoices');
      }

      const json = await response.json();
      const result = invoicesResponseSchema.safeParse(json);

      if (!result.success) {
        throw new Error(
          `Invalid response from workspace invoices API: ${result.error.message}`
        );
      }

      return result.data;
    },
    enabled: options?.enabled !== false,
    initialData: options?.initialData,
    // Keep previous data while fetching new page - prevents UI from becoming unresponsive
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ==================== LEGACY HOOKS ====================

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

// Users with selectable groups (groups where they have STUDENT role)
export const useUsersWithSelectableGroups = (wsId: string) => {
  return useQuery({
    queryKey: ['users-with-selectable-groups', wsId],
    queryFn: async () => {
      const supabase = createClient();

      // Single query using join to get users with STUDENT role groups
      const { data, error } = await supabase
        .from('workspace_users')
        .select(`
          *,
          workspace_user_groups_users!inner(role)
        `)
        .eq('ws_id', wsId)
        .eq('workspace_user_groups_users.role', 'STUDENT')
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
        .neq('promo_type', 'REFERRAL')
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

export const useInfiniteUserInvoices = (
  wsId: string,
  userId: string,
  pageSize = 10
) => {
  return useInfiniteQuery({
    queryKey: ['infinite-user-invoices', wsId, userId],
    queryFn: async ({ pageParam = 0 }) => {
      const supabase = createClient();
      const from = pageParam * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from('finance_invoices')
        .select('*', { count: 'exact' })
        .eq('ws_id', wsId)
        .eq('customer_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      return {
        data: (data as Invoice[]) || [],
        count: count || 0,
        nextPage: data && data.length === pageSize ? pageParam + 1 : undefined,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
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

export const useUserAttendance = (
  groupId: string,
  userId: string,
  month: string
) => {
  return useQuery({
    queryKey: ['user-attendance', groupId, userId, month],
    queryFn: async () => {
      const supabase = createClient();

      // Parse the month to get start and end dates
      const startOfMonth = new Date(`${month}-01`);
      const nextMonth = new Date(startOfMonth);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const { data, error } = await supabase
        .from('user_group_attendance')
        .select('date, status')
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

// Get multiple groups' attendance combined (for multi-group selection)
export const useMultiGroupUserAttendance = (
  groupIds: string[],
  userId: string,
  month: string
) => {
  return useQuery({
    queryKey: ['multi-group-user-attendance', groupIds, userId, month],
    queryFn: async () => {
      if (groupIds.length === 0) return [];

      const supabase = createClient();

      // Parse the month to get start and end dates
      const startOfMonth = new Date(`${month}-01`);
      const nextMonth = new Date(startOfMonth);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const { data, error } = await supabase
        .from('user_group_attendance')
        .select('date, status, group_id')
        .in('group_id', groupIds)
        .eq('user_id', userId)
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .lt('date', nextMonth.toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) {
        console.error('❌ Multi-group user attendance fetch error:', error);
        throw error;
      }

      return data || [];
    },
    enabled: groupIds.length > 0 && !!userId && !!month,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 3,
  });
};

// Get workspace config for attendance-based invoice calculation
// Returns true if attendance-based calculation should be used (default), false if all sessions should be included
export const useInvoiceAttendanceConfig = (wsId: string) => {
  return useQuery({
    queryKey: ['invoice-attendance-config', wsId],
    queryFn: async () => {
      if (!wsId) return true; // Default to true for backward compatibility

      try {
        const res = await fetch(
          `/api/v1/workspaces/${wsId}/settings/INVOICE_USE_ATTENDANCE_BASED_CALCULATION`
        );

        if (!res.ok) {
          if (res.status === 404) {
            // Config not set, return default (true)
            return true;
          }
          throw new Error('Failed to fetch invoice attendance config');
        }

        const data = await res.json();
        // workspace_configs stores values as text, so we need to parse "true"/"false" strings
        const value = data.value?.toLowerCase();
        return value === 'true' || value === true;
      } catch (error) {
        console.error('❌ Invoice attendance config fetch error:', error);
        // Return default (true) on error to maintain backward compatibility
        return true;
      }
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000, // 5 minutes - config doesn't change often
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 2, // Fewer retries since we have a default fallback
  });
};

// Get workspace config for allowing promotions for standard invoices
// Returns true if promotions are allowed for standard invoices (default), false otherwise
export const useInvoicePromotionConfig = (wsId: string) => {
  return useQuery({
    queryKey: ['invoice-promotion-config', wsId],
    queryFn: async () => {
      if (!wsId) return true; // Default to true for backward compatibility

      try {
        const res = await fetch(
          `/api/v1/workspaces/${wsId}/settings/INVOICE_ALLOW_PROMOTIONS_FOR_STANDARD`
        );

        if (!res.ok) {
          if (res.status === 404) {
            // Config not set, return default (true)
            return true;
          }
          throw new Error('Failed to fetch invoice promotion config');
        }

        const data = await res.json();
        // workspace_configs stores values as text, so we need to parse "true"/"false" strings
        const value = data.value?.trim().toLowerCase();
        return value !== 'false';
      } catch (error) {
        console.error('❌ Invoice promotion config fetch error:', error);
        // Return default (true) on error to maintain backward compatibility
        return true;
      }
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  });
};

// Get workspace config for blocked groups from creating invoices
// Returns array of blocked group IDs
export const useInvoiceBlockedGroups = (wsId: string) => {
  return useQuery({
    queryKey: ['invoice-blocked-groups', wsId],
    queryFn: async () => {
      if (!wsId) return [];

      try {
        const res = await fetch(
          `/api/v1/workspaces/${wsId}/settings/INVOICE_BLOCKED_GROUP_IDS_FOR_CREATION`
        );

        if (!res.ok) {
          if (res.status === 404) {
            return [];
          }
          throw new Error('Failed to fetch invoice blocked groups config');
        }

        const data = await res.json();
        const value = data.value?.trim();

        if (!value) return [];

        return value
          .split(',')
          .map((id: string) => id.trim())
          .filter(Boolean);
      } catch (error) {
        console.error('❌ Invoice blocked groups config fetch error:', error);
        return [];
      }
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  });
};

// Get User's Group Products with improved caching
export const useUserGroupProducts = (groupId: string) => {
  return useQuery({
    queryKey: ['user-group-products', groupId],
    queryFn: async () => {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('user_group_linked_products')
        .select(
          'workspace_products(id, name, product_categories(name)), inventory_units(name, id), warehouse_id'
        )
        .eq('group_id', groupId);

      if (error) {
        console.error('❌ Group products fetch error:', error);
        throw error;
      }
      return data as UserGroupProducts[];
    },
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 3,
  });
};

// Get multiple groups' linked products combined (for multi-group selection)
export const useMultiGroupProducts = (groupIds: string[]) => {
  return useQuery({
    queryKey: ['multi-group-products', groupIds],
    queryFn: async () => {
      if (groupIds.length === 0) return [];

      const supabase = createClient();

      const { data, error } = await supabase
        .from('user_group_linked_products')
        .select(
          'group_id, workspace_user_groups(name), workspace_products(id, name, product_categories(name)), inventory_units(name, id), warehouse_id'
        )
        .in('group_id', groupIds);

      if (error) {
        console.error('❌ Multi-group products fetch error:', error);
        throw error;
      }
      return (data || []) as (UserGroupProducts & { group_id?: string })[];
    },
    enabled: groupIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 3,
  });
};

// Get User's Latest Subscription Invoice
export const useUserLatestSubscriptionInvoice = (
  userId: string,
  groupId: string
) => {
  return useQuery({
    queryKey: ['user-latest-subscription-invoice', userId, groupId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('finance_invoice_user_groups')
        .select('finance_invoices!inner(valid_until, created_at)')
        .eq('user_group_id', groupId)
        .eq('finance_invoices.customer_id', userId)
        .order('created_at', {
          referencedTable: 'finance_invoices',
          ascending: false,
        })
        .limit(1);

      if (error) {
        console.error(
          '❌ User latest subscription invoice fetch error:',
          error
        );
        throw error;
      }

      const invoices = (data ?? [])
        .map((row: FinanceInvoiceUserGroupRow) => row.finance_invoices)
        .filter(
          (
            invoice
          ): invoice is Pick<FinanceInvoiceRow, 'valid_until' | 'created_at'> =>
            !!invoice
        );

      return invoices;
    },
    enabled: !!userId && !!groupId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 3,
  });
};

// Get User's Latest Subscription Invoice for multiple groups
export const useMultiGroupLatestSubscriptionInvoice = (
  userId: string,
  groupIds: string[]
) => {
  return useQuery({
    queryKey: ['multi-group-latest-subscription-invoice', userId, groupIds],
    queryFn: async () => {
      if (groupIds.length === 0) return [];

      const supabase = createClient();

      const { data: validGroups, error: validGroupsError } = await supabase
        .from('workspace_user_groups_users')
        .select('group_id')
        .eq('user_id', userId)
        .eq('role', 'STUDENT')
        .in('group_id', groupIds);

      if (validGroupsError) {
        console.error(
          '❌ Multi-group latest subscription invoice valid groups error:',
          validGroupsError
        );
        throw validGroupsError;
      }

      const validGroupIds = (validGroups || [])
        .map((row) => row.group_id)
        .filter((id): id is string => !!id);

      if (validGroupIds.length === 0) return [];

      const { data, error } = await supabase
        .from('finance_invoice_user_groups')
        .select(
          'user_group_id, finance_invoices!inner(valid_until, created_at)'
        )
        .in('user_group_id', validGroupIds)
        .eq('finance_invoices.customer_id', userId)
        .order('created_at', {
          referencedTable: 'finance_invoices',
          ascending: false,
        });

      if (error) {
        console.error(
          '❌ Multi-group latest subscription invoice fetch error:',
          error
        );
        throw error;
      }

      const sortedRows = (data ?? []).slice().sort((a, b) => {
        const aDate = a.finance_invoices?.created_at
          ? new Date(a.finance_invoices.created_at).getTime()
          : 0;
        const bDate = b.finance_invoices?.created_at
          ? new Date(b.finance_invoices.created_at).getTime()
          : 0;
        return bDate - aDate;
      });

      // Deduplicate to get only the latest invoice per group
      const latestInvoicesMap = new Map<
        string,
        { group_id: string; valid_until: string | null; created_at: string }
      >();

      sortedRows.forEach((row) => {
        const groupId = row.user_group_id;
        if (groupId && !latestInvoicesMap.has(groupId)) {
          latestInvoicesMap.set(groupId, {
            group_id: groupId,
            valid_until: row.finance_invoices?.valid_until ?? null,
            created_at: row.finance_invoices?.created_at ?? '',
          });
        }
      });

      return Array.from(latestInvoicesMap.values());
    },
    enabled: !!userId && groupIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 3,
  });
};

// Get User's Linked Promotion
export const useUserLinkedPromotions = (userId: string) => {
  return useQuery({
    queryKey: ['user-linked-promotions', userId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('user_linked_promotions')
        .select('promo_id, workspace_promotions(name, code, value, use_ratio)')
        .eq('user_id', userId);

      if (error) {
        console.error('❌ User linked promotions fetch error:', error);
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

// Per-user referral discounts (percent) from view
export const useUserReferralDiscounts = (wsId: string, userId: string) => {
  return useQuery({
    queryKey: ['user-referral-discounts', wsId, userId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('v_user_referral_discounts')
        .select('promo_id, calculated_discount_value')
        .eq('ws_id', wsId)
        .eq('user_id', userId);

      if (error) {
        console.error('❌ User referral discounts fetch error:', error);
        throw error;
      }

      return (
        (data || []).map((row) => ({
          promo_id: row.promo_id as string | null,
          calculated_discount_value: row.calculated_discount_value as
            | number
            | null,
        })) || []
      );
    },
    enabled: !!wsId && !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 3,
  });
};

// Combined promotions list: all regular promos + only user's linked referral promos
export type AvailablePromotion = {
  id: string;
  name: string | null;
  code: string | null;
  value: number;
  use_ratio: boolean;
  is_referral: boolean;
  max_uses?: number | null;
  current_uses?: number | null;
};

export const useAvailablePromotions = (wsId: string, userId: string) => {
  return useQuery({
    queryKey: ['available-promotions', wsId, userId],
    queryFn: async () => {
      const supabase = createClient();

      // Regular (non-referral) promotions
      const { data: regular, error: regularErr } = await supabase
        .from('workspace_promotions')
        .select('id, name, code, value, use_ratio, max_uses, current_uses')
        .eq('ws_id', wsId)
        .neq('promo_type', 'REFERRAL')
        .order('code', { ascending: true });
      if (regularErr) throw regularErr;

      // User-linked promotions (could include referral)
      const { data: linked, error: linkedErr } = await supabase
        .from('user_linked_promotions')
        .select(
          'promo_id, workspace_promotions(id, name, code, value, use_ratio, promo_type, max_uses, current_uses)'
        )
        .eq('user_id', userId);
      if (linkedErr) throw linkedErr;

      // Build result: include all regular + only linked where promo_type == 'REFERRAL'
      const resultMap = new Map<string, AvailablePromotion>();
      for (const p of regular || []) {
        const maxUses = p.max_uses as number | null | undefined;
        const currentUses = p.current_uses as number | null | undefined;
        if (
          maxUses !== null &&
          maxUses !== undefined &&
          Number(currentUses ?? 0) >= Number(maxUses)
        ) {
          continue;
        }
        resultMap.set(p.id, {
          id: p.id,
          name: p.name,
          code: p.code,
          value: Number(p.value ?? 0),
          use_ratio: !!p.use_ratio,
          is_referral: false,
          max_uses: maxUses ?? null,
          current_uses: currentUses ?? 0,
        });
      }

      for (const row of linked || []) {
        const p = row.workspace_promotions;
        if (p?.promo_type === 'REFERRAL' && p?.id) {
          const maxUses = p.max_uses as number | null | undefined;
          const currentUses = p.current_uses as number | null | undefined;
          if (
            maxUses !== null &&
            maxUses !== undefined &&
            Number(currentUses ?? 0) >= Number(maxUses)
          ) {
            continue;
          }
          resultMap.set(p.id, {
            id: p.id,
            name: p.name ?? null,
            code: p.code ?? null,
            value: Number(p.value ?? 0),
            use_ratio: !!p.use_ratio,
            is_referral: true,
            max_uses: maxUses ?? null,
            current_uses: currentUses ?? 0,
          });
        }
      }

      return Array.from(resultMap.values()) as AvailablePromotion[];
    },
    enabled: !!wsId && !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 3,
  });
};

export function useCreatePromotion(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      code: string;
      value: number;
      unit: 'percentage' | 'currency';
      max_uses?: number | null;
    }) => {
      const res = await fetch(`/api/v1/workspaces/${wsId}/promotions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: input.name,
          description: input.description,
          code: input.code,
          value: input.value,
          unit: input.unit,
          max_uses: input.max_uses ?? null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || 'Failed to create promotion');
      }

      const parsed = createdPromotionResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error(
          `Invalid response from create promotion API: ${parsed.error.message}`
        );
      }

      return parsed.data.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['available-promotions', wsId],
      });
    },
  });
}

// Get Pending Invoices for a workspace
export const usePendingInvoices = (
  wsId: string,
  params: {
    page?: number;
    pageSize?: number;
    q?: string;
    userIds?: string[];
    groupByUser?: boolean;
    enabled?: boolean;
  } = {}
) => {
  const {
    page = 1,
    pageSize = 10,
    q = '',
    userIds = [],
    groupByUser = false,
    enabled = true,
  } = params;

  return useQuery({
    queryKey: [
      'pending-invoices',
      wsId,
      { page, pageSize, q, userIds, groupByUser },
    ],
    queryFn: async () => {
      const supabase = createClient();

      // Calculate limit and offset
      const offset = (page - 1) * pageSize;

      // Fetch data with pagination and filters
      let rawData: unknown = null;
      let error: unknown = null;

      if (groupByUser) {
        const response = await supabase.rpc(
          'get_pending_invoices_grouped_by_user',
          {
            p_ws_id: wsId,
            p_limit: pageSize,
            p_offset: offset,
            p_query: q || undefined,
            p_user_ids: userIds.length > 0 ? userIds : undefined,
          }
        );
        rawData = response.data;
        error = response.error;
      } else {
        const response = await supabase.rpc('get_pending_invoices', {
          p_ws_id: wsId,
          p_limit: pageSize,
          p_offset: offset,
          p_query: q || undefined,
          p_user_ids: userIds.length > 0 ? userIds : undefined,
        });
        rawData = response.data;
        error = response.error;
      }

      if (error) {
        console.error('❌ Pending invoices fetch error:', error);
        throw error;
      }

      const result = pendingInvoicesRawSchema.safeParse(rawData || []);
      if (!result.success) {
        throw new Error(
          `Invalid response from get_pending_invoices RPC: ${result.error.message}`
        );
      }

      const data = result.data;

      // Fetch total count with filters
      let countData: unknown = null;
      let countError: unknown = null;

      if (groupByUser) {
        const response = await supabase.rpc(
          'get_pending_invoices_grouped_by_user_count',
          {
            p_ws_id: wsId,
            p_query: q || undefined,
            p_user_ids: userIds.length > 0 ? userIds : undefined,
          }
        );
        countData = response.data;
        countError = response.error;
      } else {
        const response = await supabase.rpc('get_pending_invoices_count', {
          p_ws_id: wsId,
          p_query: q || undefined,
          p_user_ids: userIds.length > 0 ? userIds : undefined,
        });
        countData = response.data;
        countError = response.error;
      }

      if (countError) {
        console.error('❌ Pending invoices count error:', countError);
        throw countError;
      }

      const countResult = z.number().safeParse(countData);
      if (!countResult.success) {
        throw new Error(
          `Invalid response from get_pending_invoices_count RPC: ${countResult.error.message}`
        );
      }

      const count = countResult.data;

      // Transform months_owed from CSV string to array
      const transformedData = data.map((invoice) => ({
        ...invoice,
        months_owed:
          typeof invoice.months_owed === 'string'
            ? parseMonthsOwed(invoice.months_owed)
            : invoice.months_owed,
      })) as PendingInvoice[];

      return {
        data: transformedData,
        count: count || 0,
      };
    },
    enabled: !!wsId && enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes - more frequent refresh for pending data
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true, // Refetch when window gains focus
    placeholderData: keepPreviousData,
    retry: 3,
  });
};

// Get count of pending invoices for the current month
export const usePendingInvoicesCurrentMonthCount = (
  wsId: string,
  groupByUser = false,
  enabled = true
) => {
  return useQuery({
    queryKey: ['pending-invoices-current-month', wsId, groupByUser],
    queryFn: async () => {
      const supabase = createClient();

      // Get current month in YYYY-MM format
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // Fetch all pending invoices without pagination to count current month
      let rawData: unknown = null;
      let error: unknown = null;

      if (groupByUser) {
        const response = await supabase.rpc(
          'get_pending_invoices_grouped_by_user',
          {
            p_ws_id: wsId,
            p_limit: 10000,
            p_offset: 0,
          }
        );
        rawData = response.data;
        error = response.error;
      } else {
        const response = await supabase.rpc('get_pending_invoices', {
          p_ws_id: wsId,
          p_limit: 10000,
          p_offset: 0,
        });
        rawData = response.data;
        error = response.error;
      }

      if (error) {
        console.error('❌ Pending invoices current month count error:', error);
        throw error;
      }

      const result = pendingInvoicesRawSchema.safeParse(rawData || []);
      if (!result.success) {
        throw new Error(
          `Invalid response from get_pending_invoices RPC (current month count): ${result.error.message}`
        );
      }

      const data = result.data;

      // Count invoices that include the current month
      const currentMonthCount = data.filter((invoice) => {
        const monthsOwed =
          typeof invoice.months_owed === 'string'
            ? parseMonthsOwed(invoice.months_owed)
            : invoice.months_owed || [];
        return monthsOwed.includes(currentMonth);
      }).length;

      return currentMonthCount;
    },
    enabled: !!wsId && enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    retry: 3,
  });
};
