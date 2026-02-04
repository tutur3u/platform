import {
  getCurrencyLocale,
  type SupportedCurrency,
} from '@tuturuuu/utils/currencies';

import { useWorkspaceConfig } from './use-workspace-config';

// Re-export for convenience
export type { SupportedCurrency } from '@tuturuuu/utils/currencies';

export const useWorkspaceCurrency = (wsId: string) => {
  const { data, isLoading, error } = useWorkspaceConfig<SupportedCurrency>(
    wsId,
    'DEFAULT_CURRENCY',
    'USD'
  );

  const currency = (data as SupportedCurrency) ?? 'USD';

  return {
    currency,
    locale: getCurrencyLocale(currency),
    isLoading,
    error,
  };
};
