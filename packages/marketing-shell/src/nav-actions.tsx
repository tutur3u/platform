'use client';
import { lazy, Suspense, useState } from 'react';
import { MarketingThemeToggle } from './theme-toggle';
import { cn } from '@tuturuuu/utils/format';
import type { MarketingLocale, Translate } from './i18n';
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
    <button
      type="button"
      aria-label={props.t('common.main_navigation')}
      aria-expanded={false}
      className="rounded-lg p-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      onClick={() => setRequested(true)}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
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
      {navCompact ? null : (
        <LinkComponent
          className={cn(
            'inline-flex h-10 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground text-sm transition-opacity hover:opacity-90',
            pathname === '/login' && 'pointer-events-none opacity-50'
          )}
          href={signInHref}
        >
          {t('common.get-started')}
        </LinkComponent>
      )}
      {onLocaleChange ? (
        <button
          aria-label={locale === 'en' ? 'Tiếng Việt' : 'English'}
          className="hidden h-10 min-w-10 items-center justify-center rounded-lg border bg-background px-3 font-medium text-sm md:inline-flex"
          onClick={() => onLocaleChange(locale === 'en' ? 'vi' : 'en')}
          type="button"
        >
          {locale}
        </button>
      ) : null}
      <MarketingThemeToggle />
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
