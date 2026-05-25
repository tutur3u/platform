import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  InvoiceAnalyticsFilters,
  InvoiceTotalsByGroup,
} from '@tuturuuu/types/primitives/Invoice';
import {
  getInvoiceAnalyticsWithInternalApi,
  type InvoiceAnalyticsResponse,
} from '../internal-api';

interface UseInvoiceAnalyticsResult {
  walletData?: InvoiceTotalsByGroup[];
  creatorData?: InvoiceTotalsByGroup[];
  dailyWalletData?: InvoiceTotalsByGroup[];
  weeklyWalletData?: InvoiceTotalsByGroup[];
  monthlyWalletData?: InvoiceTotalsByGroup[];
  dailyCreatorData?: InvoiceTotalsByGroup[];
  weeklyCreatorData?: InvoiceTotalsByGroup[];
  monthlyCreatorData?: InvoiceTotalsByGroup[];
  hasDateRange: boolean;
  startDate?: string;
  endDate?: string;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

/**
 * Fetch invoice analytics data with filter support
 *
 * @param wsId - Workspace ID
 * @param filters - Optional filters (walletIds, userIds, startDate, endDate)
 * @param weekStartsOn - First day of week (0=Sunday, 1=Monday, 6=Saturday)
 * @returns Analytics data with loading and error states
 */
export function useInvoiceAnalytics(
  wsId: string,
  filters: InvoiceAnalyticsFilters = {},
  weekStartsOn: 0 | 1 | 6 = 1
): UseInvoiceAnalyticsResult {
  const {
    walletIds = [],
    userIds = [],
    startDate,
    endDate,
    granularity,
  } = filters;

  const query = useQuery({
    queryKey: [
      'invoice-analytics',
      wsId,
      { walletIds, userIds, startDate, endDate, weekStartsOn, granularity },
    ],
    queryFn: async (): Promise<InvoiceAnalyticsResponse> => {
      return getInvoiceAnalyticsWithInternalApi(wsId, {
        endDate,
        granularity,
        startDate,
        userIds,
        walletIds,
        weekStartsOn,
      });
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  const data = query.data;

  return {
    ...(data || {}),
    hasDateRange: data?.hasDateRange || false,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  };
}
