'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import type { ReactNode } from 'react';
import { AccountSwitcherKeyboardShortcut } from '@/components/account-switcher';
import { AccountSwitcherProvider } from '@/context/account-switcher-context';
import { CalendarPreferencesProvider } from '@/lib/calendar-preferences-provider';

const queryClient = new QueryClient();

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <CalendarPreferencesProvider>
        <AccountSwitcherProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <AccountSwitcherKeyboardShortcut />
          <ReactQueryDevtools initialIsOpen={false} />
        </AccountSwitcherProvider>
      </CalendarPreferencesProvider>
    </QueryClientProvider>
  );
}
