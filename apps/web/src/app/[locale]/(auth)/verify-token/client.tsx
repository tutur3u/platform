'use client';

import { normalizeClientRedirectPath } from '@tuturuuu/auth/cross-app';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { AuthProgressCard } from '../login/continue-card-parts';

export function BasicTokenVerifier() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleUser = async () => {
      router.push(
        normalizeClientRedirectPath(searchParams.get('nextUrl'), '/personal')
      );
      return;
    };
    handleUser();
  }, [searchParams, router]);

  return (
    <main className="fixed inset-0 flex items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-[400px]">
        <AuthProgressCard label={t('account_switcher.redirecting')} />
      </div>
    </main>
  );
}
