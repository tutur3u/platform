'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarProvider } from '@tuturuuu/ui/hooks/use-calendar';
import type React from 'react';

interface ClientLayoutWrapperProps {
  children: React.ReactNode;
}

export default function ClientLayoutWrapper({
  children,
}: ClientLayoutWrapperProps) {
  const queryClient = useQueryClient();
  
  // Create a wrapper for useQueryClient that matches the expected interface
  const wrappedUseQueryClient = () => {
    return {
      invalidateQueries: async (options: { queryKey: string[]; refetchType?: string } | string[]) => {
        if (Array.isArray(options)) {
          await queryClient.invalidateQueries({ queryKey: options });
        } else {
          await queryClient.invalidateQueries({ 
            queryKey: options.queryKey,
            refetchType: options.refetchType as any
          });
        }
      },
      setQueryData: (queryKey: string[], data: unknown) => {
        queryClient.setQueryData(queryKey, data);
      }
    };
  };

  return (
    <CalendarProvider useQuery={useQuery} useQueryClient={wrappedUseQueryClient}>
      {children}
    </CalendarProvider>
  );
}
