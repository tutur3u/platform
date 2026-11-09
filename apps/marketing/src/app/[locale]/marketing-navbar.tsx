import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { Suspense } from 'react';
import { MarketingNavMenu } from './marketing-nav/marketing-nav-menu';
import { MarketingNavShell } from './marketing-nav/marketing-nav-shell';
import Menu from './menu';
import NavbarLogoLink from './navbar-logo-link';
import PublicNavbarActions from './public-navbar-actions';

export default function MarketingNavbar() {
  return (
    <MarketingNavShell
      actions={
        <>
          <Suspense
            fallback={
              <div className="h-10 w-22 animate-pulse rounded-lg bg-foreground/5" />
            }
          >
            <PublicNavbarActions />
          </Suspense>
          <Suspense>
            <Menu sbUser={null} user={null} />
          </Suspense>
        </>
      }
      logo={
        <Suspense>
          <NavbarLogoLink
            logo={TUTURUUU_LOCAL_LOGO_URL}
            title={<LogoTitle />}
          />
        </Suspense>
      }
      menu={<MarketingNavMenu />}
    />
  );
}
