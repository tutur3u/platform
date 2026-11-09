'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Check } from '@tuturuuu/icons/lucide';
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

  useEffect(() => {
    if (!isInitialized || hasRun.current) return;
    hasRun.current = true;

    const handleAddAccount = async () => {
      try {
        const result = await addAccount({
          returnUrl,
        });

        if (result.success) {
          // Show success UI briefly before redirecting
          setStatus('success');

          // Wait a moment to show the success UI, then redirect
          await new Promise((resolve) => setTimeout(resolve, 500));

          window.location.assign(result.redirectTo || '/');
        } else {
          setStatus('error');
          setErrorMessage(result.error || 'Failed to add account');
        }
      } catch (error) {
        setStatus('error');
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred'
        );
      }
    };

    handleAddAccount();
  }, [isInitialized, addAccount, returnUrl]);

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
                <Check className="h-6 w-6 text-dynamic-green" />
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
