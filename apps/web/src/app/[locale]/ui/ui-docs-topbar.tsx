import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { Suspense } from 'react';
import { MarketingNavMenu } from '../marketing-nav/marketing-nav-menu';
import { MarketingNavShell } from '../marketing-nav/marketing-nav-shell';
import Menu from '../menu';
import NavbarLogoLink from '../navbar-logo-link';
import PublicNavbarActions from '../public-navbar-actions';

/**
 * Docs-scoped variant of the marketing navbar.
 *
 * It is the same shell, the same floating pill and the same
 * Products/Resources menu as the rest of the site — the docs previously ran
 * the older shared `Navbar` with `MainNavigationMenu`, so moving between /ui
 * and any marketing page swapped navigation systems mid-session.
 *
 * The only difference is placement: the docs bar lives at the top of the
 * right-hand column rather than over the viewport, so it sticks to the column
 * and always carries its surface instead of fading one in on scroll.
 */
export function UiDocsTopbar() {
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
      placement="column"
    />
  );
}
