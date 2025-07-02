// import ServerMenu from './server-menu';
import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { Navbar as SharedNavbar } from '@tuturuuu/ui/navbar';
import { Suspense } from 'react';
import NavbarActions from './navbar-actions';
import NavbarSeparator from './navbar-separator';
import { MainNavigationMenu } from './navigation-menu';
import ServerMenu from './server-menu';

export default function Navbar({
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
        <div className="h-10 w-[88px] animate-pulse rounded-lg bg-foreground/5" />
      }
    >
      <NavbarActions hideMetadata={hideMetadata} />
    </Suspense>
  );

  return (
    <div className="fixed top-0 z-50 w-full border-border/40 border-b bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <SharedNavbar
          logo="/media/logos/nova-transparent.png"
          title={<LogoTitle text="Upskii" />}
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
      </div>
    </div>
  );
}
