'use client';

import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { verifyRouteToken } from '.';

export function TokenVerifierCore({ failurePath }: { failurePath?: string }) {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const router = useRouter();

  useEffect(() => {
    verifyRouteToken({ failurePath, searchParams, token, router });
  }, [failurePath, token, router, searchParams]);

  return (
    <div className="mt-4 flex h-fit w-full items-center justify-center">
      <LoadingIndicator className="h-10 w-10" />
    </div>
  );
}
