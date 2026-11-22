'use client';

import { ArrowLeft, LogOut } from '@tuturuuu/icons/lucide';
import {
  logoutBrowserSessionWithInternalApi,
  logoutSatelliteAppWithInternalApi,
} from '@tuturuuu/internal-api/auth';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import {
  TUTURUUU_LOCAL_LOGO_URL,
  TuturuuLogo,
} from '@tuturuuu/ui/custom/tuturuuu-logo';
import type { LogoutTarget } from '@tuturuuu/utils/logout-target';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { navigateFromLogout } from './logout-navigation';

export function LogoutChoices({
  target,
  email,
  locale = 'en',
  canLogoutBrowser = true,
}: {
  target: LogoutTarget | null;
  email: string | null;
  locale?: string;
  canLogoutBrowser?: boolean;
}) {
  const t = useTranslations('logout');
  const [pending, setPending] = useState<'app' | 'browser' | null>(null);
  const [failed, setFailed] = useState(false);
  const [appLoggedOut, setAppLoggedOut] = useState(false);

  const logout = async (scope: 'app' | 'browser') => {
    if (pending) return;
    setPending(scope);
    setFailed(false);
    try {
      if (scope === 'app') {
        if (!target) throw new Error('No registered app selected');
        const result = await logoutSatelliteAppWithInternalApi({
          baseUrl: target.origin,
        });
        if (result.success !== true) throw new Error('App logout failed');
        setAppLoggedOut(true);
      } else {
        if (!canLogoutBrowser) return;
        const result = await logoutBrowserSessionWithInternalApi();
        if (result.success !== true) throw new Error('Browser logout failed');
        navigateFromLogout(locale === 'vi' ? '/vi/login' : '/login');
      }
    } catch {
      setFailed(true);
    } finally {
      setPending(null);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8 text-foreground sm:px-6">
      <section
        aria-labelledby="logout-title"
        className="flex w-full max-w-[400px] flex-col gap-4 rounded-[28px] border bg-card p-6"
      >
        <TuturuuLogo
          className="self-center"
          height={40}
          src={TUTURUUU_LOCAL_LOGO_URL}
          width={40}
        />
        <div className="flex flex-col gap-1.5 text-center">
          <h1
            id="logout-title"
            className="text-balance font-extrabold text-2xl tracking-[-0.02em]"
          >
            {appLoggedOut && target
              ? t('app-done', { app: target.name })
              : t('confirm-title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {appLoggedOut ? t('others-stay-signed-in') : t('this-browser')}
          </p>
          {email && (
            <p className="mt-1 inline-flex h-7 max-w-full items-center self-center truncate rounded-full bg-secondary px-3 font-semibold text-muted-foreground text-xs">
              {email}
            </p>
          )}
          {!appLoggedOut && canLogoutBrowser && (
            <p className="text-muted-foreground text-sm">
              {t('current-account')}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2.5">
          {target && !appLoggedOut && (
            <Button
              className="min-h-12 w-full whitespace-normal rounded-2xl font-bold"
              disabled={pending !== null}
              onClick={() => void logout('app')}
            >
              {pending === 'app' ? (
                <LoadingIndicator />
              ) : (
                <LogOut className="size-4 shrink-0" />
              )}
              {t('app-only', { app: target.name })}
            </Button>
          )}
          {!appLoggedOut && canLogoutBrowser && (
            <Button
              variant="outline"
              className="min-h-12 w-full whitespace-normal rounded-2xl border-destructive/40 font-bold text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={pending !== null}
              onClick={() => void logout('browser')}
            >
              {pending === 'browser' ? (
                <LoadingIndicator />
              ) : (
                <LogOut className="size-4 shrink-0" />
              )}
              {t('all-current-account')}
            </Button>
          )}
          <Button
            variant="ghost"
            className="min-h-12 w-full whitespace-normal rounded-2xl font-bold"
            disabled={pending !== null}
            onClick={() =>
              navigateFromLogout(
                appLoggedOut
                  ? locale === 'vi'
                    ? '/vi'
                    : '/'
                  : (target?.origin ?? (locale === 'vi' ? '/vi' : '/'))
              )
            }
          >
            <ArrowLeft className="size-4 shrink-0" />
            {appLoggedOut
              ? t('go-to-dashboard')
              : target
                ? t('back-to-app', { app: target.name })
                : t('go-back')}
          </Button>
        </div>
        {failed && (
          <p
            role="alert"
            className="rounded-2xl bg-dynamic-red/10 px-3.5 py-3 font-semibold text-dynamic-red text-sm"
          >
            {t('error')}
          </p>
        )}
        <p role="status" aria-live="polite" className="sr-only">
          {pending ? t('in-progress') : ''}
        </p>
      </section>
    </main>
  );
}
