import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { Navbar as SharedNavbar } from '@tuturuuu/ui/navbar';
import { Suspense } from 'react';
import Menu from '../menu';
import NavbarLogoLink from '../navbar-logo-link';
import NavbarSeparator from '../navbar-separator';
import { MainNavigationMenu } from '../navigation-menu';
import PublicNavbarActions from '../public-navbar-actions';

/**
 * Docs-scoped variant of {@link MarketingNavbar}. Unlike the marketing navbar it
 * is rendered inside the docs right-column (not as a viewport-fixed overlay), so
 * the position is overridden to `sticky` and it gets a solid background instead
 * of the transparent marketing treatment.
 */
export function UiDocsTopbar() {
  return (
    <SharedNavbar
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
      className="!static !z-40 lg:!sticky lg:!top-0 border-b"
      contentClassName="bg-background/80 !px-4 backdrop-blur md:!px-8 lg:!px-10"
      customLogoLink={
        <Suspense>
          <NavbarLogoLink
            logo={TUTURUUU_LOCAL_LOGO_URL}
            title={<LogoTitle />}
          />
        </Suspense>
      }
      logo={TUTURUUU_LOCAL_LOGO_URL}
      navigationMenu={<MainNavigationMenu />}
      separator={<NavbarSeparator />}
      title={<LogoTitle />}
    />
  );
}
