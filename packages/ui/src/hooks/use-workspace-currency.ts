import { useWorkspaceConfig } from './use-workspace-config';

export type SupportedCurrency = 'VND' | 'USD';

export const useWorkspaceCurrency = (wsId: string) => {
  const { data, isLoading, error } = useWorkspaceConfig<SupportedCurrency>(
    wsId,
    'DEFAULT_CURRENCY',
    'USD'
  );

  const currency = (data as SupportedCurrency) ?? 'USD';

  return {
    currency,
    locale: currency === 'VND' ? 'vi-VN' : 'en-US',
    isLoading,
    error,
  };
};
