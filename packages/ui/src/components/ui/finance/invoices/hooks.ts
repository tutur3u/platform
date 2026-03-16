import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { Invoice } from '@tuturuuu/types/primitives/Invoice';
import type { PendingInvoice } from '@tuturuuu/types/primitives/PendingInvoice';
import { parseMonthsOwed } from '@tuturuuu/types/primitives/PendingInvoice';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { z } from 'zod';
import type { Product, Promotion, UserGroupProducts } from './types';
import type { UserGroup } from './utils';

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

const invoicesResponseSchema = z.object({
  data: z.array(invoiceSchema),
  count: z.number(),
});

const pendingInvoiceSchema = z.object({
  user_id: z.string(),
  user_name: z.string(),
  user_avatar_url: z.string().nullable().optional(),
  group_id: z.string().optional(),
  group_name: z.string().optional(),
  group_ids: z.array(z.string()).optional(),
  group_names: z.array(z.string()).optional(),
  months_owed: z.union([z.string(), z.array(z.string())]),
  attendance_days: z.number(),
  total_sessions: z.number(),
  potential_total: z.number(),
  href: z.string().optional(),
  ws_id: z.string().optional(),
});

const pendingInvoicesResponseSchema = z.object({
  data: z.array(pendingInvoiceSchema),
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
        `/api/v1/workspaces/${wsId}/finance/invoices?${searchParams.toString()}`,
        { cache: 'no-store' }
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
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users?limit=500`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch workspace users');
      }

      const payload = (await response.json()) as
        | WorkspaceUser[]
        | { data?: WorkspaceUser[] };

      return (Array.isArray(payload) ? payload : payload.data || []) as
        | WorkspaceUser[]
        | [];
    },
  });
};

const INVOICE_CUSTOMER_PAGE_SIZE = 25;

type WorkspaceUsersPage = {
  data: WorkspaceUser[];
  count: number;
  offset: number;
};

function parseWorkspaceUsersPayload(
  payload: WorkspaceUser[] | { data?: WorkspaceUser[]; count?: number }
) {
  if (Array.isArray(payload)) {
    return {
      data: payload,
      count: payload.length,
    };
  }

  return {
    data: payload.data ?? [],
    count: payload.count ?? payload.data?.length ?? 0,
  };
}

async function fetchInvoiceCustomerPage(
  wsId: string,
  searchQuery: string,
  offset: number
): Promise<WorkspaceUsersPage> {
  const searchParams = new URLSearchParams({
    from: String(offset),
    to: String(offset + INVOICE_CUSTOMER_PAGE_SIZE - 1),
    limit: String(INVOICE_CUSTOMER_PAGE_SIZE),
  });

  if (searchQuery.trim()) {
    searchParams.set('q', searchQuery.trim());
  }

  const response = await fetch(
    `/api/v1/workspaces/${wsId}/users?${searchParams.toString()}`,
    {
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch workspace users');
  }

  const payload = parseWorkspaceUsersPayload(
    (await response.json()) as
      | WorkspaceUser[]
      | { data?: WorkspaceUser[]; count?: number }
  );

  return {
    data: payload.data,
    count: payload.count,
    offset,
  };
}

async function fetchWorkspaceUserById(
  wsId: string,
  userId: string
): Promise<WorkspaceUser | null> {
  const response = await fetch(`/api/v1/workspaces/${wsId}/users/${userId}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch workspace user');
  }

  const payload = (await response.json()) as WorkspaceUser[] | WorkspaceUser;
  if (Array.isArray(payload)) {
    return payload[0] ?? null;
  }
  return payload ?? null;
}

export function useInvoiceCustomerSearch(
  wsId: string,
  searchQuery: string,
  selectedUserId: string
) {
  const normalizedSearchQuery = searchQuery.trim();

  const usersQuery = useInfiniteQuery({
    queryKey: ['invoice-customer-search', wsId, normalizedSearchQuery],
    queryFn: async ({ pageParam = 0 }) =>
      fetchInvoiceCustomerPage(wsId, normalizedSearchQuery, pageParam),
    initialPageParam: 0,
    placeholderData: (previousData) => previousData,
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce(
        (total, page) => total + page.data.length,
        0
      );
      return loadedCount < lastPage.count ? loadedCount : undefined;
    },
    enabled: !!wsId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const loadedCustomers =
    usersQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const selectedUserQuery = useQuery({
    queryKey: ['invoice-customer', wsId, selectedUserId],
    queryFn: async () => fetchWorkspaceUserById(wsId, selectedUserId),
    enabled:
      !!wsId &&
      !!selectedUserId &&
      !loadedCustomers.some((user) => user.id === selectedUserId),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const customersById = new Map<string, WorkspaceUser>();

  if (selectedUserQuery.data) {
    customersById.set(selectedUserQuery.data.id, selectedUserQuery.data);
  }

  for (const customer of loadedCustomers) {
    customersById.set(customer.id, customer);
  }

  const customers = Array.from(customersById.values());
  const selectedUser =
    (selectedUserId
      ? customers.find((user) => user.id === selectedUserId)
      : undefined) ?? undefined;

  return {
    ...usersQuery,
    customers,
    selectedUser,
    error: usersQuery.error ?? selectedUserQuery.error,
    isLoading: usersQuery.isLoading || selectedUserQuery.isLoading,
    isFetchingSelectedUser: selectedUserQuery.isFetching,
  };
}

// Users with selectable groups (groups where they have STUDENT role)
export const useUsersWithSelectableGroups = (wsId: string) => {
  return useQuery({
    queryKey: ['users-with-selectable-groups', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users?limit=500`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch workspace users');
      }

      const payload = (await response.json()) as
        | WorkspaceUser[]
        | { data?: WorkspaceUser[] };

      return (Array.isArray(payload) ? payload : payload.data || []) as
        | WorkspaceUser[]
        | [];
    },
  });
};

export const useProducts = (wsId: string) => {
  return useQuery({
    queryKey: ['products', wsId],
    queryFn: async () => {
      const pageSize = 500;
      let page = 1;
      let count = 0;
      const products: Product[] = [];

      do {
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/inventory/products?page=${page}&pageSize=${pageSize}`,
          { cache: 'no-store' }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch products');
        }

        const payload = (await response.json()) as {
          data?: Product[];
          count?: number;
        };

        products.push(...(payload.data ?? []));
        count = payload.count ?? products.length;
        page += 1;
      } while (products.length < count);

      return products;
    },
  });
};

export const usePromotions = (wsId: string) => {
  return useQuery({
    queryKey: ['promotions', wsId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/promotions`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch promotions');
      }

      const data = (await response.json()) as Array<
        Promotion & { promo_type?: string | null }
      >;
      return data.filter((promotion) => promotion.promo_type !== 'REFERRAL');
    },
  });
};

export const useWallets = (wsId: string) => {
  return useQuery({
    queryKey: ['wallets', wsId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/wallets`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch wallets');
      }

      return ((await response.json()) as Wallet[]) || [];
    },
  });
};

export const useCategories = (wsId: string) => {
  return useQuery({
    queryKey: ['categories', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/workspaces/${wsId}/transactions/categories`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch categories');
      }

      return ((await response.json()) as TransactionCategory[]) || [];
    },
  });
};

export const useUserInvoices = (wsId: string, userId: string) => {
  return useQuery({
    queryKey: ['user-invoices', wsId, userId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/finance/invoices?page=1&pageSize=100&customerIds=${userId}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch user invoices');
      }

      const payload = (await response.json()) as InvoicesResponse;
      return payload.data || [];
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
    queryFn: async ({ pageParam = 1 }: { pageParam: number }) => {
      const searchParams = new URLSearchParams({
        page: String(pageParam),
        pageSize: String(pageSize),
      });
      searchParams.append('customerIds', userId);

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/finance/invoices?${searchParams.toString()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch user invoices');
      }

      const payload = (await response.json()) as InvoicesResponse;
      const data = payload.data || [];
      const count = payload.count ?? 0;
      const fetchedCount = pageParam * pageSize;

      return {
        data,
        count,
        nextPage: fetchedCount < count ? pageParam + 1 : null,
        hasMore: fetchedCount < count,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: !!userId,
  });
};

// Subscription-specific hooks
export const useUserGroups = (wsId: string, userId: string) => {
  return useQuery({
    queryKey: ['user-groups', wsId, userId],
    queryFn: async (): Promise<UserGroup[]> => {
      if (!userId) return [];

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/${userId}/user-groups`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch user groups');
      }

      return (((await response.json()) as UserGroup[]) || []).map((group) => ({
        workspace_user_groups: group.workspace_user_groups ?? null,
      }));
    },
    enabled: !!wsId && !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 3,
  });
};

export const useSubscriptionInvoiceContext = (
  wsId: string,
  userId: string,
  groupIds: string[],
  month: string
) => {
  return useQuery({
    queryKey: ['subscription-invoice-context', wsId, userId, groupIds, month],
    queryFn: async () => {
      if (!wsId || !userId || groupIds.length === 0 || !month) {
        return {
          attendance: [] as Array<{
            status: string;
            date: string;
            group_id?: string;
          }>,
          latestInvoices: [] as Array<{
            group_id?: string;
            valid_until?: string | null;
            created_at?: string | null;
          }>,
        };
      }

      const searchParams = new URLSearchParams({
        userId,
        month,
      });
      groupIds.forEach((groupId) => {
        searchParams.append('groupIds', groupId);
      });

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/finance/invoices/subscription/context?${searchParams.toString()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch subscription invoice context');
      }

      return (await response.json()) as {
        attendance: Array<{
          status: string;
          date: string;
          group_id?: string;
        }>;
        latestInvoices: Array<{
          group_id?: string;
          valid_until?: string | null;
          created_at?: string | null;
        }>;
      };
    },
    enabled: !!wsId && !!userId && groupIds.length > 0 && !!month,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
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
          `/api/v1/workspaces/${wsId}/settings/INVOICE_USE_ATTENDANCE_BASED_CALCULATION`,
          { cache: 'no-store' }
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
          `/api/v1/workspaces/${wsId}/settings/INVOICE_ALLOW_PROMOTIONS_FOR_STANDARD`,
          { cache: 'no-store' }
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
          `/api/v1/workspaces/${wsId}/settings/INVOICE_BLOCKED_GROUP_IDS_FOR_CREATION`,
          { cache: 'no-store' }
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
export const useUserGroupProducts = (wsId: string, groupId: string) => {
  return useQuery({
    queryKey: ['user-group-products', wsId, groupId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/linked-products`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch linked products');
      }

      const payload = (await response.json()) as {
        items?: Array<{
          id: string;
          name: string | null;
          description?: string | null;
          warehouse_id: string | null;
          unit_id: string | null;
        }>;
      };

      return (payload.items ?? []).map((item) => ({
        workspace_products: {
          id: item.id,
          name: item.name,
          product_categories: {
            name: null,
          },
        },
        inventory_units: item.unit_id
          ? {
              id: item.unit_id,
              name: null,
            }
          : null,
        warehouse_id: item.warehouse_id,
      })) as UserGroupProducts[];
    },
    enabled: !!wsId && !!groupId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 3,
  });
};

// Get multiple groups' linked products combined (for multi-group selection)
export const useMultiGroupProducts = (wsId: string, groupIds: string[]) => {
  return useQuery({
    queryKey: ['multi-group-products', wsId, groupIds],
    queryFn: async () => {
      if (groupIds.length === 0) return [];

      const searchParams = new URLSearchParams();
      groupIds.forEach((groupId) => {
        searchParams.append('groupIds', groupId);
      });

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/linked-products?${searchParams.toString()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch linked products');
      }

      const payload = (await response.json()) as {
        items?: Array<UserGroupProducts & { group_id?: string }>;
      };

      return payload.items ?? [];
    },
    enabled: !!wsId && groupIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 3,
  });
};

// Get User's Linked Promotion
export const useUserLinkedPromotions = (wsId: string, userId: string) => {
  return useQuery({
    queryKey: ['user-linked-promotions', wsId, userId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/${userId}/linked-promotions`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch linked promotions');
      }

      return (
        ((await response.json()) as Array<{
          promo_id: string | null;
          workspace_promotions?: {
            id?: string | null;
            name?: string | null;
            code?: string | null;
            value?: number | null;
            use_ratio?: boolean | null;
            promo_type?: string | null;
            max_uses?: number | null;
            current_uses?: number | null;
          } | null;
        }>) || []
      );
    },
    enabled: !!wsId && !!userId,
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
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/${userId}/referral-discounts`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch referral discounts');
      }

      const data = (await response.json()) as Array<{
        promo_id: string | null;
        calculated_discount_value: number | null;
      }>;

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
      const [regularResponse, linkedResponse] = await Promise.all([
        fetch(`/api/v1/workspaces/${wsId}/promotions`, {
          cache: 'no-store',
        }),
        userId
          ? fetch(
              `/api/v1/workspaces/${wsId}/users/${userId}/linked-promotions`,
              { cache: 'no-store' }
            )
          : Promise.resolve(null),
      ]);

      if (!regularResponse.ok) {
        throw new Error('Failed to fetch promotions');
      }

      if (linkedResponse && !linkedResponse.ok) {
        throw new Error('Failed to fetch linked promotions');
      }

      const regular = (await regularResponse.json()) as Array<{
        id: string;
        name: string | null;
        code: string | null;
        value: number | null;
        use_ratio: boolean | null;
        promo_type?: string | null;
        max_uses?: number | null;
        current_uses?: number | null;
      }>;
      const linked = linkedResponse
        ? ((await linkedResponse.json()) as Array<{
            promo_id: string | null;
            workspace_promotions?: {
              id?: string | null;
              name?: string | null;
              code?: string | null;
              value?: number | null;
              use_ratio?: boolean | null;
              promo_type?: string | null;
              max_uses?: number | null;
              current_uses?: number | null;
            } | null;
          }>)
        : [];

      // Build result: include all regular + only linked where promo_type == 'REFERRAL'
      const resultMap = new Map<string, AvailablePromotion>();
      for (const p of regular || []) {
        if (p.promo_type === 'REFERRAL') {
          continue;
        }
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
      const searchParams = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        q: q || '',
        groupByUser: String(groupByUser),
      });

      userIds.forEach((userId) => {
        searchParams.append('userIds', userId);
      });

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/finance/invoices/pending?${searchParams.toString()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch pending invoices');
      }

      const json = await response.json();
      const result = pendingInvoicesResponseSchema.safeParse(json);

      if (!result.success) {
        throw new Error(
          `Invalid response from pending invoices API: ${result.error.message}`
        );
      }

      // Transform months_owed from CSV string to array if needed
      const transformedData = result.data.data.map((invoice: any) => ({
        ...invoice,
        months_owed:
          typeof invoice.months_owed === 'string'
            ? parseMonthsOwed(invoice.months_owed)
            : invoice.months_owed,
      })) as PendingInvoice[];

      return {
        data: transformedData,
        count: result.data.count || 0,
      };
    },
    enabled: !!wsId && enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
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
      const searchParams = new URLSearchParams({
        groupByUser: String(groupByUser),
        currentMonthOnly: 'true',
      });

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/finance/invoices/pending?${searchParams.toString()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch pending invoices current month count');
      }

      const count = await response.json();
      return typeof count === 'number' ? count : 0;
    },
    enabled: !!wsId && enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    retry: 3,
  });
};
