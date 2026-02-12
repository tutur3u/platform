import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { TUTURUUU_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { Navbar as SharedNavbar } from '@tuturuuu/ui/navbar';
import { Suspense } from 'react';
import NavbarActions from './navbar-actions';
import NavbarLogoLink from './navbar-logo-link';
import NavbarSeparator from './navbar-separator';
import { MainNavigationMenu } from './navigation-menu';
import ServerMenu from './server-menu';

export default async function Navbar({
  hideMetadata = false,
  onlyOnMobile = false,
}: {
  hideMetadata?: boolean;
  onlyOnMobile?: boolean;
}) {
  const renderServerMenu = () => (
    <Suspense>
      <ServerMenu />
    </Suspense>
  );

  const renderNavbarActions = () => (
    <Suspense
      fallback={
        <div className="h-10 w-22 animate-pulse rounded-lg bg-foreground/5" />
      }
    >
      <NavbarActions hideMetadata={hideMetadata} />
    </Suspense>
  );

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
          {renderServerMenu()}
          {renderNavbarActions()}
        </>
      }
      separator={<NavbarSeparator />}
      onlyOnMobile={onlyOnMobile}
    />
  );
}
