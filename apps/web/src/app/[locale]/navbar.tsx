import LocalWorkspaceSelect from './local-workspace-select';
import NavbarActions from './navbar-actions';
import NavbarSeparator from './navbar-separator';
import { MainNavigationMenu } from './navigation-menu';
import ServerMenu from './server-menu';
import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { Navbar as SharedNavbar } from '@tuturuuu/ui/navbar';
import { Suspense } from 'react';

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
        <div className="bg-foreground/5 h-10 w-[88px] animate-pulse rounded-lg" />
      }
    >
      <NavbarActions hideMetadata={hideMetadata} />
    </Suspense>
  );

  return (
    <SharedNavbar
      logo="/media/logos/transparent.png"
      title={<LogoTitle />}
      afterTitle={
        <Suspense
          fallback={
            <div className="bg-foreground/5 h-10 w-32 animate-pulse rounded-lg" />
          }
        >
          <LocalWorkspaceSelect />
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
