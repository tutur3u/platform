'use client';

import { describeWebAccountSaveError } from '@tuturuuu/internal-api/auth';
import { Check } from '@tuturuuu/icons/lucide-static';
import { Button } from '@tuturuuu/ui/button';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  type JSX,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAccountSwitcher } from '@/context/account-switcher-context';
import { AuthStateCard } from '../login/auth-state-card';
import { AuthProgressCard } from '../login/continue-card-parts';

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

  const handleAddAccount = useCallback(async () => {
    try {
      const result = await addAccount({
        returnUrl,
      });

      if (result.success) {
        setStatus('success');
        await new Promise((resolve) => setTimeout(resolve, 500));
        window.location.assign(result.redirectTo || '/');
        return;
      }

      setStatus('error');
      setErrorMessage(describeWebAccountSaveError(result, t));
    } catch (error) {
      setStatus('error');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('account_switcher.account_added_error')
      );
    }
  }, [addAccount, returnUrl, t]);

  useEffect(() => {
    if (!isInitialized || hasRun.current) return;
    hasRun.current = true;
    void handleAddAccount();
  }, [handleAddAccount, isInitialized]);

  return (
    <AddAccountFrame>
      {status === 'loading' ? (
        <AuthProgressCard
          description={t('account_switcher.please_wait')}
          label={t('account_switcher.adding_account')}
        />
      ) : status === 'success' ? (
        <AuthStateCard
          description={
            <span aria-atomic="true" aria-live="polite" role="status">
              {t('account_switcher.redirecting')}
            </span>
          }
          illustration={
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-calendar-bg-green">
              <Check aria-hidden className="size-7 text-dynamic-green" />
            </span>
          }
          title={t('account_switcher.account_added_success')}
        />
      ) : (
        <AuthStateCard title={t('account_switcher.account_added_error')}>
          <p
            className="rounded-2xl bg-dynamic-red/10 px-3.5 py-3 text-dynamic-red text-sm leading-relaxed"
            role="alert"
          >
            {errorMessage}
          </p>
          <Button
            className="h-12 w-full rounded-2xl font-bold"
            onClick={() => {
              setStatus('loading');
              setErrorMessage('');
              void handleAddAccount();
            }}
            type="button"
          >
            {t('account_switcher.retry')}
          </Button>
          <Button
            className="h-12 w-full rounded-2xl font-bold"
            onClick={() => router.push('/')}
            type="button"
            variant="outline"
          >
            {t('common.back-to-home')}
          </Button>
        </AuthStateCard>
      )}
    </AddAccountFrame>
  );
}

/** The add-account page: the same centred 400px auth column. */
function AddAccountFrame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4 text-foreground">
      <div className="flex w-full max-w-[400px] flex-col gap-4">{children}</div>
    </main>
  );
}

export function AddAccountFallback(): JSX.Element {
  const t = useTranslations();

  return (
    <AddAccountFrame>
      <AuthProgressCard
        description={t('account_switcher.please_wait')}
        label={t('account_switcher.adding_account')}
      />
    </AddAccountFrame>
  );
}
