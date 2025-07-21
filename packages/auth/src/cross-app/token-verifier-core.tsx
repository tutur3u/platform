'use client';

import { verifyRouteToken } from '.';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export function TokenVerifierCore({ devMode }: { devMode: boolean }) {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const router = useRouter();

  useEffect(() => {
    verifyRouteToken({ searchParams, token, router, devMode });
  }, [token, router, searchParams, devMode]);

  return (
    <div className="mt-4 flex h-fit w-full items-center justify-center">
      <LoadingIndicator className="h-10 w-10" />
    </div>
  );
}
