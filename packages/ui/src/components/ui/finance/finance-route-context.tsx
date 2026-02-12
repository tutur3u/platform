'use client';

import { createContext, useContext } from 'react';

/**
 * Context for the finance route prefix.
 *
 * In apps/web, finance routes live under `/{wsId}/finance/...`,
 * so the prefix is "/finance" (the default).
 *
 * In apps/finance (the satellite app), routes are directly at `/{wsId}/...`,
 * so the prefix should be set to "" via FinanceRouteProvider.
 */
const FinanceRouteContext = createContext('/finance');

export function FinanceRouteProvider({
  children,
  prefix = '/finance',
}: {
  children: React.ReactNode;
  prefix?: string;
}) {
  return (
    <FinanceRouteContext.Provider value={prefix}>
      {children}
    </FinanceRouteContext.Provider>
  );
}

/**
 * Returns a function that prepends the finance route prefix to a path.
 *
 * Usage:
 * ```tsx
 * const financeHref = useFinanceHref();
 * // In web app: financeHref('/transactions') → '/finance/transactions'
 * // In finance satellite app: financeHref('/transactions') → '/transactions'
 * ```
 */
export function useFinanceHref() {
  const prefix = useContext(FinanceRouteContext);
  return (path: string) => `${prefix}${path}`;
}

/**
 * Returns the raw finance route prefix string.
 */
export function useFinanceRoutePrefix() {
  return useContext(FinanceRouteContext);
}
