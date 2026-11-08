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
import { useEffect, useRef, useState } from 'react';
import {
  type PrivacyConsent as PrivacyChoice,
  type PrivacyConsentStorage,
  PRIVACY_CONSENT_STORAGE_KEY,
  PRIVACY_PROVIDERS,
  readPrivacyConsent,
  savePrivacyConsent,
} from '@/lib/privacy-consent';

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
  const [ready, setReady] = useState(false);
  const [choice, setChoice] = useState<PrivacyChoice | null>(null);
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const failedWrite = useRef(false);
  const hasMarketing = PRIVACY_PROVIDERS.some(
    ({ purpose }) => purpose === 'marketing'
  );

  useEffect(() => {
    if (!enabled) return;
    const restore = () => {
      const saved = failedWrite.current
        ? null
        : readPrivacyConsent({ storage: browserStorage() });
      setChoice(saved);
      setAnalytics(saved?.analytics ?? false);
      setMarketing(saved?.marketing ?? false);
      setReady(true);
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

  if (!enabled || !ready) return null;

  const save = (allowAnalytics: boolean, allowMarketing: boolean) => {
    const result = savePrivacyConsent({
      storage: browserStorage(),
      analytics: allowAnalytics,
      marketing: hasMarketing && allowMarketing,
    });
    failedWrite.current = !result.ok;
    setChoice(result.choice);
    setAnalytics(result.choice?.analytics ?? false);
    setMarketing(result.choice?.marketing ?? false);
    setSaveFailed(!result.ok);
    if (result.ok) setOpen(false);
  };

  const settings = (nextOpen: boolean) => {
    if (nextOpen) {
      const saved = failedWrite.current
        ? null
        : readPrivacyConsent({ storage: browserStorage() });
      setChoice(saved);
      setAnalytics(saved?.analytics ?? false);
      setMarketing(saved?.marketing ?? false);
    }
    setOpen(nextOpen);
  };

  const privacyLink = (
    <Link className="underline underline-offset-4" href={`/${locale}/privacy`}>
      {t('privacy_policy')}
    </Link>
  );

  return (
    <Dialog open={open} onOpenChange={settings}>
      {!choice && (
        <section
          aria-label={t('title')}
          className="fixed inset-x-4 bottom-16 z-40 mx-auto max-h-[calc(100dvh-6rem)] max-w-3xl overflow-y-auto rounded-xl border bg-background p-5 text-foreground shadow-lg"
        >
          <h2 className="font-semibold">{t('title')}</h2>
          <p className="mt-2 text-muted-foreground text-sm">
            {t('description')}
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            {t('analytics_disabled')}
          </p>
          <p className="mt-2 text-sm">{privacyLink}</p>
          {saveFailed && !open && (
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
      )}
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
        {saveFailed && (
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
