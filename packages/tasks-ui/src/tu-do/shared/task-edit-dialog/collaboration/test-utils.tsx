import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

/** Renders with a fresh QueryClient that never retries or caches between tests. */
export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

/** Translator mock that echoes the key and interpolated values. */
export function echoTranslator(key: string, values?: Record<string, string>) {
  return values ? `${key} ${Object.values(values).join(' ')}` : key;
}
