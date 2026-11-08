'use client';

import { cookieConsentBanner, evaluateFlags } from '@tuturuuu/feature-flags';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Switch } from '@tuturuuu/ui/switch';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { type ReactNode, useEffect, useReducer, useState } from 'react';
import {
  type PrivacyConsentStorage,
  PRIVACY_CONSENT_STORAGE_KEY,
  PRIVACY_PROVIDERS,
  savePrivacyConsent,
} from '@/lib/privacy-consent';
import {
  loadPrivacyConsentState,
  type PrivacyConsentState,
  transitionPrivacyConsentState,
} from '@/lib/privacy-consent-state';

const enabled = evaluateFlags(
  [cookieConsentBanner],
  {},
  {
    cookie_consent_banner:
      process.env.NEXT_PUBLIC_COOKIE_CONSENT_BANNER === 'true',
  }
).cookie_consent_banner;

function browserStorage(): PrivacyConsentStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function PrivacyConsent() {
  const t = useTranslations('privacy-consent');
  const locale = useLocale();
  const [state, dispatch] = useReducer(transitionPrivacyConsentState, {
    kind: 'initial',
  } satisfies PrivacyConsentState);
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const hasMarketing = PRIVACY_PROVIDERS.some(
    ({ purpose }) => purpose === 'marketing'
  );

  useEffect(() => {
    if (!enabled) return;
    const restore = () => {
      dispatch({
        kind: 'restore',
        state: loadPrivacyConsentState({ storage: browserStorage() }),
      });
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === PRIVACY_CONSENT_STORAGE_KEY) {
        restore();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') restore();
    };
    restore();
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', restore);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', restore);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (!enabled) return null;

  const save = (allowAnalytics: boolean, allowMarketing: boolean) => {
    const result = savePrivacyConsent({
      storage: browserStorage(),
      analytics: allowAnalytics,
      marketing: hasMarketing && allowMarketing,
    });
    setAnalytics(allowAnalytics);
    setMarketing(hasMarketing && allowMarketing);
    if (result.ok) {
      dispatch({ kind: 'save-succeeded', choice: result.choice });
      setOpen(false);
    } else {
      dispatch({ kind: 'save-failed' });
    }
  };

  const settings = (nextOpen: boolean) => {
    if (nextOpen) {
      const restored = loadPrivacyConsentState({ storage: browserStorage() });
      dispatch({ kind: 'restore', state: restored });
      if (state.kind !== 'save-error') {
        setAnalytics(restored.kind === 'saved' && restored.choice.analytics);
        setMarketing(restored.kind === 'saved' && restored.choice.marketing);
      }
    }
    setOpen(nextOpen);
  };

  const privacyLink = (
    <Link className="underline underline-offset-4" href={`/${locale}/privacy`}>
      {t('privacy_policy')}
    </Link>
  );

  const prompt = (
    reason: 'absent' | 'stale' | 'unavailable' | 'save-error'
  ) => (
    <section
      aria-label={t('title')}
      className="fixed inset-x-4 bottom-16 z-40 mx-auto max-h-[calc(100dvh-6rem)] max-w-3xl overflow-y-auto rounded-xl border bg-background p-5 text-foreground shadow-lg"
    >
      <h2 className="font-semibold">{t('title')}</h2>
      <p className="mt-2 text-muted-foreground text-sm">{t('description')}</p>
      <p className="mt-2 text-muted-foreground text-sm">
        {t('analytics_disabled')}
      </p>
      <p className="mt-2 text-sm">{privacyLink}</p>
      {reason === 'stale' && (
        <p className="mt-3 text-muted-foreground text-sm">
          {t('choice_outdated')}
        </p>
      )}
      {reason === 'unavailable' && (
        <p className="mt-3 text-muted-foreground text-sm" role="status">
          {t('storage_unavailable')}
        </p>
      )}
      {reason === 'save-error' && !open && (
        <p className="mt-3 text-destructive text-sm" role="alert">
          {t('save_failed')}
        </p>
      )}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Button variant="outline" onClick={() => save(false, false)}>
          {t('reject')}
        </Button>
        <Button variant="outline" onClick={() => save(true, hasMarketing)}>
          {t('accept_optional')}
        </Button>
        <Button variant="outline" onClick={() => settings(true)}>
          {t('customize')}
        </Button>
      </div>
    </section>
  );

  let banner: ReactNode;
  switch (state.kind) {
    case 'initial':
      return null;
    case 'prompt':
      banner = prompt(state.reason);
      break;
    case 'saved':
      banner = null;
      break;
    case 'save-error':
      banner = prompt('save-error');
      break;
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }

  return (
    <Dialog open={open} onOpenChange={settings}>
      {banner}
      <DialogTrigger asChild>
        <Button
          className="fixed bottom-4 left-4 z-40 shadow-sm"
          size="sm"
          variant="outline"
        >
          {t('settings')}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>{t('settings')}</DialogTitle>
          <DialogDescription>{t('settings_description')}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div>
            <label className="font-medium text-sm" htmlFor="privacy-necessary">
              {t('necessary')}
            </label>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('necessary_description')}
            </p>
          </div>
          <Switch
            id="privacy-necessary"
            aria-label={t('necessary')}
            checked
            disabled
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div>
            <label className="font-medium text-sm" htmlFor="privacy-analytics">
              {t('analytics')}
            </label>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('analytics_disabled')}
            </p>
          </div>
          <Switch
            id="privacy-analytics"
            checked={analytics}
            onCheckedChange={setAnalytics}
          />
        </div>
        {hasMarketing && (
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <label className="font-medium text-sm" htmlFor="privacy-marketing">
              {t('marketing')}
            </label>
            <Switch
              id="privacy-marketing"
              checked={marketing}
              onCheckedChange={setMarketing}
            />
          </div>
        )}
        <p className="text-sm">{privacyLink}</p>
        {state.kind === 'prompt' && state.reason === 'unavailable' && (
          <p className="text-muted-foreground text-sm" role="status">
            {t('storage_unavailable')}
          </p>
        )}
        {state.kind === 'save-error' && (
          <p className="text-destructive text-sm" role="alert">
            {t('save_failed')}
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={() => save(false, false)}>
            {t('reject')}
          </Button>
          <Button onClick={() => save(analytics, marketing)}>
            {t('save')}
          </Button>
        </div>
        <DialogClose asChild>
          <Button variant="ghost">{t('close')}</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
