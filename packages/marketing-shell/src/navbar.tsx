import type { MarketingLocale, Translate } from './i18n';
import type { ReactNode } from 'react';
import { cn } from '@tuturuuu/utils/format';
import { MarketingActions } from './nav-actions';
import { MarketingNavMenu } from './nav-menu';
import { MarketingNavShell } from './nav-shell';
import { navControl } from './nav-styles';
import type { ShellImage, ShellLink } from './types';

const Anchor: ShellLink = (props) => <a {...props} />;
const Img: ShellImage = ({ alt, ...props }) => <img alt={alt} {...props} />;

/** The marketing navbar shared by every marketing page. */
export function MarketingNavbar({
  actions,
  brandHref,
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
  actions?: ReactNode;
  brandHref?: string;
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
  return (
    <MarketingNavShell
      compact={navCompact}
      logo={
        <LinkComponent
          className={cn(
            navControl,
            'gap-2 pr-2 pl-1.5 text-foreground hover:bg-accent'
          )}
          href={brandHref ?? `${siteUrl}/home`}
        >
          {/* Decorative: the brand name beside it is the link's text. */}
          <ImageComponent
            alt=""
            className={navCompact ? 'size-6' : 'size-7'}
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
                  'sr-only text-base md:not-sr-only md:inline md:font-semibold'
                : 'font-semibold text-lg tracking-tight'
            }
          >
            Tuturuuu
          </span>
        </LinkComponent>
      }
      menu={<MarketingNavMenu siteUrl={siteUrl} t={t} />}
      actions={
        actions ?? (
          <MarketingActions
            t={t}
            locale={locale}
            onLocaleChange={onLocaleChange}
            pathname={pathname}
            siteUrl={siteUrl}
            signInHref={signInHref}
            navCompact={navCompact}
            LinkComponent={LinkComponent}
          />
        )
      }
    />
  );
}
