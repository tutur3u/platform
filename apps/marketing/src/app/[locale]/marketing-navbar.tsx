import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { Suspense } from 'react';
import { MarketingNavMenu } from './marketing-nav/marketing-nav-menu';
import { MarketingNavShell } from './marketing-nav/marketing-nav-shell';
import Menu from './menu';
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
        <a
          className="flex flex-none items-center gap-2 rounded focus-visible:outline-2 focus-visible:outline-ring"
          href="/"
        >
          <img src={TUTURUUU_LOCAL_LOGO_URL} width={32} height={32} alt="" />
          <span className="font-bold text-2xl">Tuturuuu</span>
        </a>
      }
      menu={<MarketingNavMenu />}
    />
  );
}
