'use client';

import { createContext, useContext } from 'react';

/**
 * Set by the shared sidebar around its stacked footer (account and
 * notifications). The footer is one vertical icon column in the rail and in the
 * panel; `expanded` tells each control whether to reveal its label to the
 * right of the icon, so expanding never moves an icon.
 */
export const SidebarFooterContext = createContext({ expanded: false });

export function useSidebarFooter() {
  return useContext(SidebarFooterContext);
}
