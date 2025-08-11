'use client';

import { DEV_MODE } from '@/constants/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useCallback, useMemo } from 'react';

type RefetchType = 'active' | 'all' | 'inactive';

export default function Home() {
  const t = useTranslations('calendar');
  const locale = useLocale();
  const queryClient = useQueryClient();

  // Create a wrapper for the t function to match the expected type signature
  // Type assertion needed due to next-intl's complex type system
  const translationWrapper = useCallback(
    (key: string, values?: Record<string, unknown>) => {
      // @ts-expect-error - next-intl uses complex conditional types
      return t(key, values);
    },
    [t]
  );

  // Create a stable, memoized client-like API and return it from a stable callback
  const memoizedQueryClientApi = useMemo(
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

  const wrappedUseQueryClient = useCallback(
    () => memoizedQueryClientApi,
    [memoizedQueryClientApi]
  );

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
        useQuery={useQuery}
        useQueryClient={wrappedUseQueryClient}
        enableHeader={false}
        disabled
      />
    </div>
  );
}
