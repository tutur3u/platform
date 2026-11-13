import type { MarketingLocale, Translate } from './i18n';
import type { ReactNode } from 'react';
import { MarketingActions } from './nav-actions';
import { MarketingNavMenu } from './nav-menu';
import { MarketingNavShell } from './nav-shell';
import type { ShellImage, ShellLink } from './types';

const Anchor: ShellLink = (props) => <a {...props} />;
const Img: ShellImage = ({ alt, ...props }) => <img alt={alt} {...props} />;

/** The marketing pill navbar shared by every marketing page. */
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
          className="flex flex-none items-center gap-2 transition-opacity hover:opacity-80"
          href={brandHref ?? `${siteUrl}/home`}
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
