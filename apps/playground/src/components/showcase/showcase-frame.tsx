import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { ROADMAP_URL, SIGN_IN_URL } from '@/lib/showcase/catalog';
import { SiteHeader } from './site-header';
import { focusRing } from './styles';

const footerLink = cn(
  'rounded-sm text-muted-foreground text-sm hover:text-foreground',
  focusRing
);

/** Page chrome for every showcase route: skip link, header, main, footer. */
export function ShowcaseFrame({ children }: { children: ReactNode }) {
  return (
    <div className="ttr-sorbet-font flex min-h-dvh flex-col bg-background text-foreground">
      <a
        className={cn(
          'sr-only rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50',
          focusRing
        )}
        href="#main"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main className="flex-1" id="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="border-border border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <p className="text-muted-foreground text-sm">
            Demos use sample data in this tab only. Nothing is saved or sent.
          </p>
          <nav aria-label="Footer" className="flex gap-4">
            <a className={footerLink} href="https://tuturuuu.com">
              Home
            </a>
            <a className={footerLink} href={ROADMAP_URL}>
              Roadmap
            </a>
            <a className={footerLink} href={SIGN_IN_URL}>
              Sign in
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
