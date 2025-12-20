'use client';

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
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type JSX, useEffect, useRef, useState } from 'react';
import { useAccountSwitcher } from '@/context/account-switcher-context';

export function AddAccountContent(): JSX.Element {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addAccount, isInitialized } = useAccountSwitcher();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [errorMessage, setErrorMessage] = useState<string>('');
  const hasRun = useRef(false);

  const returnUrl = searchParams.get('returnUrl');

  // biome-ignore lint/correctness/useExhaustiveDependencies: hasRun ref prevents duplicate execution, router.replace and returnUrl are stable
  useEffect(() => {
    if (!isInitialized || hasRun.current) return;
    hasRun.current = true;

    const handleAddAccount = async () => {
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log('[AddAccountPage] Starting account add flow');
        }

        // Get the current session from Supabase
        const supabase = createClient();
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (process.env.NODE_ENV === 'development') {
          console.log(
            '[AddAccountPage] Session status:',
            session ? 'present' : 'absent'
          );
        }

        if (error || !session) {
          console.error('[AddAccountPage] Error getting session:', error);
          setStatus('error');
          setErrorMessage(error?.message || 'No session found');
          return;
        }

        // Add the account to the store
        if (process.env.NODE_ENV === 'development') {
          console.log('[AddAccountPage] Adding account to store');
        }
        const result = await addAccount(session, {
          switchImmediately: true,
        });

        if (process.env.NODE_ENV === 'development') {
          console.log('[AddAccountPage] Account add result:', result.success);
        }

        // If account already exists, treat it as success (just switch to it)
        const accountAlreadyExists =
          !result.success &&
          result.error?.toLowerCase().includes('already exists');

        if (result.success || accountAlreadyExists) {
          if (accountAlreadyExists && process.env.NODE_ENV === 'development') {
            console.log('[AddAccountPage] Account already exists, redirecting');
          }

          // Get the return URL from query params
          let redirectUrl = '/';

          if (returnUrl) {
            try {
              const decodedUrl = decodeURIComponent(returnUrl);

              // Validate the URL to prevent open redirects
              if (decodedUrl.startsWith('/') && !decodedUrl.startsWith('//')) {
                // Safe relative path
                redirectUrl = decodedUrl;
              } else {
                // Absolute URL - validate origin and protocol
                try {
                  const parsedUrl = new URL(decodedUrl);

                  // Check protocol - only allow http: and https:
                  if (
                    parsedUrl.protocol !== 'http:' &&
                    parsedUrl.protocol !== 'https:'
                  ) {
                    if (process.env.NODE_ENV === 'development') {
                      console.warn(
                        '[AddAccountPage] Invalid protocol rejected:',
                        parsedUrl.protocol,
                        decodedUrl
                      );
                    }
                  } else if (parsedUrl.origin === window.location.origin) {
                    // Same origin - convert to relative URL
                    redirectUrl =
                      parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
                  } else {
                    if (process.env.NODE_ENV === 'development') {
                      console.warn(
                        '[AddAccountPage] Cross-origin redirect rejected:',
                        decodedUrl
                      );
                    }
                  }
                } catch {
                  if (process.env.NODE_ENV === 'development') {
                    console.warn(
                      '[AddAccountPage] Invalid absolute URL:',
                      decodedUrl
                    );
                  }
                }
              }
            } catch (error) {
              if (process.env.NODE_ENV === 'development') {
                console.warn(
                  '[AddAccountPage] Failed to decode returnUrl:',
                  error
                );
              }
            }
          }

          if (process.env.NODE_ENV === 'development') {
            console.log('[AddAccountPage] Redirecting to:', redirectUrl);
          }

          // Show success UI briefly before redirecting
          setStatus('success');

          // Wait a moment to show the success UI, then redirect
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Use router.replace for same-origin navigation since the session
          // is already added to the multi-account store client-side
          // This provides a smoother experience without a full page reload
          router.replace(redirectUrl);
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
  }, [isInitialized, addAccount]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('account_switcher.adding_account')}</CardTitle>
          <CardDescription role="status" aria-live="polite" aria-atomic="true">
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
              <p className="text-foreground/60 text-sm">
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
                  <title>Switch account success icon</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-foreground/60 text-sm">
                {t('account_switcher.redirecting')}
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/10 p-4">
                <p className="text-dynamic-red text-sm">{errorMessage}</p>
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

export function AddAccountFallback(): JSX.Element {
  const t = useTranslations();

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('account_switcher.adding_account')}</CardTitle>
          <CardDescription>
            {t('account_switcher.adding_account_description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-foreground/60 text-sm">
              {t('account_switcher.please_wait')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
