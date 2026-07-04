'use client';

import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { createContext, type ReactNode, useContext } from 'react';

/**
 * Workspace default currency, sourced from the shared `DEFAULT_CURRENCY`
 * workspace config. Provided once near the inventory operator root so any price
 * display can format against the workspace's chosen currency without prop
 * drilling. Falls back to USD until the config resolves.
 */
const WorkspaceCurrencyContext = createContext<string>('USD');

export function WorkspaceCurrencyProvider({
  children,
  wsId,
}: {
  children: ReactNode;
  wsId: string;
}) {
  const { data } = useWorkspaceConfig<string>(wsId, 'DEFAULT_CURRENCY', 'USD');

  return (
    <WorkspaceCurrencyContext.Provider value={data || 'USD'}>
      {children}
    </WorkspaceCurrencyContext.Provider>
  );
}

export function useWorkspaceCurrency() {
  return useContext(WorkspaceCurrencyContext);
}
