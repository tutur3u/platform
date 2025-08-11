'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarProvider } from '@tuturuuu/ui/hooks/use-calendar';
import type React from 'react';
import { useCallback, useMemo } from 'react';

interface ClientLayoutWrapperProps {
  children: React.ReactNode;
}

// Define proper types for refetchType
type RefetchType = 'all' | 'active' | 'inactive' | 'none';

export default function ClientLayoutWrapper({
  children,
}: ClientLayoutWrapperProps) {
  const queryClient = useQueryClient();

  // Create a memoized wrapper object for useQueryClient that matches the expected interface
  const wrappedQueryClientObject = useMemo(
    () => ({
      invalidateQueries: async (
        options: { queryKey: string[]; refetchType?: string } | string[]
      ) => {
        if (Array.isArray(options)) {
          await queryClient.invalidateQueries({ queryKey: options });
        } else {
          await queryClient.invalidateQueries({
            queryKey: options.queryKey,
            refetchType: options.refetchType as RefetchType | undefined,
          });
        }
      },
      setQueryData: (queryKey: string[], data: unknown) => {
        queryClient.setQueryData(queryKey, data);
      },
    }),
    [queryClient]
  );

  // Create a wrapper function that returns the memoized object
  const wrappedUseQueryClient = useCallback(() => {
    return wrappedQueryClientObject;
  }, [wrappedQueryClientObject]);

  return (
    <CalendarProvider
      useQuery={useQuery}
      useQueryClient={wrappedUseQueryClient}
    >
      {children}
    </CalendarProvider>
  );
}
