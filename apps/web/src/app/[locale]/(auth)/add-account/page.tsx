'use client';

import { useAccountSwitcher } from '@/context/account-switcher-context';
import { Loader2 } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AddAccountPage() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addAccount, isInitialized } = useAccountSwitcher();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!isInitialized) return;

    const handleAddAccount = async () => {
      try {
        console.log('[AddAccountPage] Starting to add account...');

        // Get the current session from Supabase
        const supabase = createClient();
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        console.log('[AddAccountPage] Current session:', session ? { id: session.user.id, email: session.user.email } : null);

        if (error || !session) {
          console.error('[AddAccountPage] Error getting session:', error);
          setStatus('error');
          setErrorMessage(error?.message || 'No session found');
          return;
        }

        // Add the account to the store
        console.log('[AddAccountPage] Adding account to store...');
        const result = await addAccount(session, {
          switchImmediately: true,
        });

        console.log('[AddAccountPage] Add account result:', result);

        // If account already exists, treat it as success (just switch to it)
        const accountAlreadyExists = !result.success && result.error?.toLowerCase().includes('already exists');

        if (result.success || accountAlreadyExists) {
          if (accountAlreadyExists) {
            console.log('[AddAccountPage] Account already exists, treating as success and redirecting');
          }

          // Get the return URL from query params
          const returnUrl = searchParams.get('returnUrl');
          const redirectUrl = returnUrl ? decodeURIComponent(returnUrl) : '/';

          console.log('[AddAccountPage] Redirecting immediately to:', redirectUrl);

          // Redirect immediately without showing success UI
          window.location.href = redirectUrl;
        } else {
          setStatus('error');
          setErrorMessage(result.error || 'Failed to add account');
        }
      } catch (error) {
        console.error('Failed to add account:', error);
        setStatus('error');
        setErrorMessage('An unexpected error occurred');
      }
    };

    handleAddAccount();
  }, [isInitialized, addAccount, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('account_switcher.adding_account')}</CardTitle>
          <CardDescription>
            {status === 'loading' &&
              t('account_switcher.adding_account_description')}
            {status === 'success' &&
              t('account_switcher.account_added_success')}
            {status === 'error' && t('account_switcher.account_added_error')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm text-foreground/60">
                {t('account_switcher.please_wait')}
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-dynamic-green/20">
                <svg
                  className="h-6 w-6 text-dynamic-green"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-sm text-foreground/60">
                {t('account_switcher.redirecting')}
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/10 p-4">
                <p className="text-sm text-dynamic-red">{errorMessage}</p>
              </div>
              <Button
                type="button"
                onClick={() => router.push('/')}
                className="w-full"
              >
                {t('common.back-to-home')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
