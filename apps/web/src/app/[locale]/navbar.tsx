import { Navbar as SharedNavbar } from '@ncthub/ui/navbar';
import Link from 'next/dist/client/link';
import Image from 'next/image';
import { Suspense } from 'react';
import NavbarActions from './navbar-actions';
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
      logo="/media/logos/transparent.png"
      customLogoLink={
        <Link href="/" className="flex flex-none items-center gap-2">
          <Image
            src="/media/logos/transparent.png"
            className="h-8 w-8"
            width={32}
            height={32}
            alt="logo"
          />
        </Link>
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
