'use client';

import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export function BasicTokenVerifier() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleUser = async () => {
      const nextUrl = searchParams.get('nextUrl');

      if (nextUrl) {
        router.push(nextUrl || '/onboarding');
        return;
      }
    };
    handleUser();
  }, [searchParams]);

  return (
    <div className="fixed inset-0 flex h-screen w-screen flex-col items-center justify-center gap-2">
      <div className="flex h-full w-full items-center justify-center">
        <LoadingIndicator className="h-10 w-10" />
      </div>
    </div>
  );
}
