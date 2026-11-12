'use client';

import { ThemeToggle } from '@tuturuuu/ui/custom/theme-toggle';
import { cn } from '@tuturuuu/utils/format';
import type { MarketingLocale, Translate } from './i18n';
import { MobileMenu } from './mobile-menu';
import { MarketingNavMenu } from './nav-menu';
import { MarketingNavShell } from './nav-shell';
import type { ShellImage, ShellLink } from './types';

const Anchor: ShellLink = (props) => <a {...props} />;
const Img: ShellImage = ({ alt, ...props }) => <img alt={alt} {...props} />;

/** The marketing pill navbar shared by every marketing page. */
export function MarketingNavbar({
  t,
  locale,
  onLocaleChange,
  pathname,
  logoSrc,
  signInHref = 'https://tuturuuu.com/login',
  siteUrl = 'https://tuturuuu.com',
  navCompact = false,
  LinkComponent = Anchor,
  ImageComponent = Img,
}: {
  t: Translate;
  locale: MarketingLocale;
  onLocaleChange?: (locale: MarketingLocale) => void;
  pathname: string;
  logoSrc: string;
  signInHref?: string;
  siteUrl?: string;
  navCompact?: boolean;
  LinkComponent?: ShellLink;
  ImageComponent?: ShellImage;
}) {
  const onLogin = pathname === '/login';
  return (
    <MarketingNavShell
      compact={navCompact}
      logo={
        <LinkComponent
          className="flex flex-none items-center gap-2 transition-opacity hover:opacity-80"
          href={`${siteUrl}/home`}
        >
          {/* Decorative: the brand name beside it is the link's text. */}
          <ImageComponent
            alt=""
            className={
              navCompact
                ? 'h-7 w-7'
                : 'h-8 w-8 transition-transform hover:scale-105'
            }
            height={32}
            src={logoSrc}
            width={32}
          />
          <span
            className={
              navCompact
                ? // Visually hidden on small screens but still the
                  // link's accessible name, since the logo is decorative
                  // (bold only once shown, so phones skip that font file).
                  'sr-only text-lg md:not-sr-only md:inline md:font-bold'
                : 'font-bold text-2xl'
            }
          >
            Tuturuuu
          </span>
        </LinkComponent>
      }
      menu={<MarketingNavMenu siteUrl={siteUrl} t={t} />}
      actions={
        <>
          {navCompact ? null : (
            <LinkComponent
              className={cn(
                'inline-flex h-10 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground text-sm transition-opacity hover:opacity-90',
                onLogin && 'pointer-events-none opacity-50'
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
          <ThemeToggle />
          <div className="flex md:hidden">
            <MobileMenu
              locale={locale}
              onLocaleChange={onLocaleChange}
              pathname={pathname}
              signInHref={signInHref}
              siteUrl={siteUrl}
              t={t}
            />
          </div>
        </>
      }
    />
  );
}
