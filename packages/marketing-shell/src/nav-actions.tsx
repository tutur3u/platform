'use client';
import { lazy, Suspense, useState } from 'react';
import { cn } from '@tuturuuu/utils/format';
import type { MarketingLocale, Translate } from './i18n';
import { MarketingPreferences } from './nav-preferences';
import { MobileMenuTrigger } from './mobile-menu-trigger';
import { navPrimary } from './nav-styles';
import type { ShellLink } from './types';
const MobileMenu = lazy(() =>
  import('./mobile-menu').then((module) => ({ default: module.MobileMenu }))
);
const Anchor: ShellLink = (props) => <a {...props} />;
type Props = {
  t: Translate;
  locale: MarketingLocale;
  onLocaleChange?: (locale: MarketingLocale) => void;
  pathname: string;
  siteUrl?: string;
  signInHref?: string;
  navCompact?: boolean;
  LinkComponent?: ShellLink;
};

function LazyMobileMenu(
  props: Props & { siteUrl: string; signInHref: string }
) {
  const [requested, setRequested] = useState(false);
  const trigger = (
    <MobileMenuTrigger
      aria-expanded={false}
      onClick={() => setRequested(true)}
      t={props.t}
    />
  );
  return requested ? (
    <Suspense fallback={trigger}>
      <MobileMenu {...props} initiallyOpen />
    </Suspense>
  ) : (
    trigger
  );
}

export function MarketingActions({
  t,
  locale,
  onLocaleChange,
  pathname,
  siteUrl = 'https://tuturuuu.com',
  signInHref = 'https://tuturuuu.com/login',
  navCompact = false,
  LinkComponent = Anchor,
}: Props) {
  return (
    <>
      <MarketingPreferences
        locale={locale}
        onLocaleChange={onLocaleChange}
        t={t}
      />
      {navCompact ? null : (
        <LinkComponent
          className={cn(
            // Phones reach it from the menu sheet.
            navPrimary,
            'hidden sm:inline-flex',
            pathname === '/login' && 'pointer-events-none opacity-50'
          )}
          href={signInHref}
        >
          {t('common.get-started')}
        </LinkComponent>
      )}
      <div className="flex md:hidden">
        <LazyMobileMenu
          locale={locale}
          onLocaleChange={onLocaleChange}
          pathname={pathname}
          signInHref={signInHref}
          siteUrl={siteUrl}
          t={t}
        />
      </div>
    </>
  );
}
