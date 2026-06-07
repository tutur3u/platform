import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { TUTURUUU_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { Navbar as SharedNavbar } from '@tuturuuu/ui/navbar';
import { Suspense } from 'react';
import Menu from './menu';
import NavbarLogoLink from './navbar-logo-link';
import NavbarSeparator from './navbar-separator';
import { MainNavigationMenu } from './navigation-menu';
import PublicNavbarActions from './public-navbar-actions';

export default function MarketingNavbar() {
  return (
    <SharedNavbar
      logo={TUTURUUU_LOGO_URL}
      title={<LogoTitle />}
      customLogoLink={
        <Suspense>
          <NavbarLogoLink logo={TUTURUUU_LOGO_URL} title={<LogoTitle />} />
        </Suspense>
      }
      navigationMenu={<MainNavigationMenu />}
      actions={
        <>
          <Suspense>
            <Menu sbUser={null} user={null} />
          </Suspense>
          <Suspense
            fallback={
              <div className="h-10 w-22 animate-pulse rounded-lg bg-foreground/5" />
            }
          >
            <PublicNavbarActions />
          </Suspense>
        </>
      }
      separator={<NavbarSeparator />}
    />
  );
}
