import {
  getCurrencyLocale,
  resolveSupportedCurrency,
  type SupportedCurrency,
} from '@tuturuuu/utils/currencies';

import { useWorkspaceConfig } from './use-workspace-config';

// Re-export for convenience
export type { SupportedCurrency } from '@tuturuuu/utils/currencies';

export const useWorkspaceCurrency = (
  wsId: string,
  fallbackCurrency = 'USD'
) => {
  const fallback = resolveSupportedCurrency(fallbackCurrency);
  const { data, isLoading, error } = useWorkspaceConfig<SupportedCurrency>(
    wsId,
    'DEFAULT_CURRENCY',
    fallback
  );

  const currency = resolveSupportedCurrency(data, fallback);

  return {
    currency,
    locale: getCurrencyLocale(currency),
    isLoading,
    error,
  };
};
