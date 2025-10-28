'use client';

import { AccountSwitcherKeyboardShortcut } from '@/components/account-switcher';
import { AccountSwitcherProvider } from '@/context/account-switcher-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import type { ReactNode } from 'react';

const queryClient = new QueryClient();

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AccountSwitcherProvider>
        <TooltipProvider>{children}</TooltipProvider>
        <AccountSwitcherKeyboardShortcut />
        {/* <ReactQueryDevtools initialIsOpen={false} /> */}
      </AccountSwitcherProvider>
    </QueryClientProvider>
  );
}
