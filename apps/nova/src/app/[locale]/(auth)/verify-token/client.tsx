'use client';

import { verifyRouteToken } from '@tuturuuu/auth/cross-app';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export default function TokenVerifier() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const router = useRouter();

  useEffect(() => {
    verifyRouteToken({ searchParams, token, router });
  }, [token, router, searchParams]);

  return null;
}
