'use client';

import { useMutation } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { Check } from '@tuturuuu/icons/lucide';
import { saveCurrentWebAccountWithInternalApi } from '@tuturuuu/internal-api/auth';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';

type AddAccountStatus = 'error' | 'loading' | 'success';

export function AddAccountPage({
  locale,
  returnUrl,
}: {
  locale: string;
  returnUrl: string | null;
}) {
  const [status, setStatus] = useState<AddAccountStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const hasRun = useRef(false);

  const { mutateAsync: saveCurrentAccount } = useMutation({
    mutationFn: (nextReturnUrl: string | null) =>
      saveCurrentWebAccountWithInternalApi({
        returnUrl: nextReturnUrl,
      }),
  });

  const addAccount = useCallback(async () => {
    try {
      const result = await saveCurrentAccount(returnUrl);

      if (!result.success) {
        setStatus('error');
        setErrorMessage(result.error || 'Failed to add account');
        return;
      }

      setStatus('success');
      await new Promise((resolve) => setTimeout(resolve, 500));
      window.location.assign(result.redirectTo || `/${locale}`);
    } catch (error) {
      setStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'An unexpected error occurred'
      );
    }
  }, [locale, returnUrl, saveCurrentAccount]);

  useEffect(() => {
    if (hasRun.current) {
      return;
    }

    hasRun.current = true;
    void addAccount();
  }, [addAccount]);

  return (
    <AddAccountCard
      errorMessage={errorMessage}
      homeHref={`/${locale}`}
      status={status}
    />
  );
}

export function AddAccountFallback() {
  return <AddAccountCard errorMessage="" homeHref="/" status="loading" />;
}

function AddAccountCard({
  errorMessage,
  homeHref,
  status,
}: {
  errorMessage: string;
  homeHref: string;
  status: AddAccountStatus;
}) {
  const t = useTranslations();

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('account_switcher.adding_account')}</CardTitle>
          <CardDescription aria-atomic="true" aria-live="polite" role="status">
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
              <Button asChild className="w-full">
                <a href={homeHref}>{t('common.back-to-home')}</a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
