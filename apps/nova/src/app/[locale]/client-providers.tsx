'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { ReactNode } from 'react';

const queryClient = new QueryClient();

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
      {/* <ReactQueryDevtools initialIsOpen={false} /> */}
    </QueryClientProvider>
  );
}