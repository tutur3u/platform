'use client';

import { DEV_MODE } from '@/constants/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useCallback } from 'react';

export default function Home() {
  const t = useTranslations('calendar');
  const locale = useLocale();
  const queryClient = useQueryClient();
  
  // Create a wrapper for the t function to match the expected type signature
  // Type assertion needed due to next-intl's complex type system
  const translationWrapper = useCallback((key: string, values?: Record<string, unknown>) => {
    // @ts-expect-error - next-intl uses complex conditional types
    return t(key, values);
  }, [t]);
  
  // Create a wrapper for useQueryClient that matches the expected interface
  const wrappedUseQueryClient = useCallback(() => {
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
  }, [queryClient]);

  return (
    <div className="relative flex h-screen flex-col overflow-y-auto p-4 pt-16 md:p-8 md:pt-20 md:pb-4 lg:p-16 lg:pt-20 lg:pb-4">
      {DEV_MODE && (
        <Link href="/scheduler">
          <Button>Scheduler</Button>
        </Link>
      )}
      <SmartCalendar
        t={translationWrapper}
        locale={locale}
        useQuery={useQuery as any}
        useQueryClient={wrappedUseQueryClient}
        enableHeader={false}
        disabled
      />
    </div>
  );
}
