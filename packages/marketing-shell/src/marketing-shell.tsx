import { cn } from '@tuturuuu/utils/format';
import { MarketingFooter } from './footer';
import { MarketingNavbar } from './navbar';
import type { MarketingShellProps } from './types';

/**
 * The one marketing layout: floating pill navbar, `#main-content` offset for
 * it (pt-20), the shared footer, and the marketing fonts. Same frame as
 * tuturuuu.com/home.
 */
export function MarketingShell({
  children,
  actions,
  brandHref,
  t,
  locale,
  onLocaleChange,
  pathname,
  signInHref,
  logoSrc,
  LinkComponent,
  ImageComponent,
  siteUrl,
  navCompact = false,
}: MarketingShellProps) {
  return (
    <div className={cn('marketing-fonts contents')}>
      <MarketingNavbar
        actions={actions}
        brandHref={brandHref}
        ImageComponent={ImageComponent}
        LinkComponent={LinkComponent}
        locale={locale}
        logoSrc={logoSrc}
        navCompact={navCompact}
        onLocaleChange={onLocaleChange}
        pathname={pathname}
        signInHref={signInHref}
        siteUrl={siteUrl}
        t={t}
      />
      <div className="flex flex-col overflow-x-clip pt-20" id="main-content">
        {children}
      </div>
      <MarketingFooter
        LinkComponent={LinkComponent}
        logoSrc={logoSrc}
        siteUrl={siteUrl}
        t={t}
      />
    </div>
  );
}
