import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { Navbar as SharedNavbar } from '@tuturuuu/ui/navbar';
import { Suspense } from 'react';
import LocalWorkspaceSelect from './local-workspace-select';
import NavbarActions from './navbar-actions';
import NavbarCalendarWrapper from './navbar-calendar-wrapper';
import NavbarSeparator from './navbar-separator';
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
        <div className="h-10 w-[88px] animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
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
            <div className="h-10 w-32 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
          }
        >
          <LocalWorkspaceSelect />
        </Suspense>
      }
      navigationMenu={
        <Suspense
          fallback={
            <div className="h-10 w-96 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
          }
        >
          <NavbarCalendarWrapper />
        </Suspense>
      }
      actions={
        <>
          {renderServerMenu()}
          {renderNavbarActions()}
        </>
      }
      separator={<NavbarSeparator />}
      onlyOnMobile={onlyOnMobile}
      className="border-b border-gray-200 bg-white/80 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/80"
    />
  );
}
