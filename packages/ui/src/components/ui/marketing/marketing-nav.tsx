'use client';

import { Menu, X } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useEffect, useState } from 'react';
import { TuturuuLogo } from '../custom/tuturuuu-logo';

export interface MarketingNavLink {
  /** In-page anchor (`#pricing`) or absolute URL. */
  href: string;
  label: string;
}

interface MarketingNavProps {
  /** App name shown next to the logo, e.g. "Forms". */
  appName: string;
  /** Where the wordmark links back to. Defaults to the landing root. */
  homeHref?: string;
  links: MarketingNavLink[];
  /**
   * Primary action button. Taken as a node rather than `{href,label}` so the
   * host can wrap it in `<Suspense>` and let a session-dependent label stream
   * in without making the whole marketing page dynamic. Render
   * `MarketingNavAction` for the standard treatment.
   */
  action: ReactNode;
  /** Secondary text action shown beside the primary on desktop. */
  secondaryAction?: { href: string; label: string };
  /** Locale/theme switchers supplied by the host app. */
  utilities?: ReactNode;
}

/**
 * Sticky marketing header.
 *
 * Starts transparent over the hero and only fades in its border and blur once
 * the page scrolls, so the hero light rig is not cropped by a hard bar on load.
 */
export function MarketingNav({
  appName,
  homeHref = '/',
  links,
  action,
  secondaryAction,
  utilities,
}: MarketingNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // A menu left open while the viewport grows to desktop would keep the page
  // scroll-locked behind an invisible panel.
  useEffect(() => {
    if (!menuOpen) return;
    const media = window.matchMedia('(min-width: 768px)');
    const close = () => media.matches && setMenuOpen(false);
    close();
    media.addEventListener('change', close);
    return () => media.removeEventListener('change', close);
  }, [menuOpen]);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled || menuOpen
          ? 'border-foreground/[0.08] border-b bg-background/80 backdrop-blur-xl'
          : 'border-transparent border-b bg-transparent'
      )}
    >
      <nav
        aria-label={appName}
        className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
      >
        <a
          className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={homeHref}
        >
          <TuturuuLogo className="h-7 w-7" height={28} width={28} />
          <span className="font-display font-semibold text-[0.95rem] tracking-[-0.01em]">
            {appName}
          </span>
        </a>

        <div className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <a
              className="rounded-full px-3.5 py-2 text-foreground/55 text-sm transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {utilities}
          {secondaryAction ? (
            <a
              className="hidden rounded-full px-3.5 py-2 text-foreground/55 text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
              href={secondaryAction.href}
            >
              {secondaryAction.label}
            </a>
          ) : null}
          {action}
          <button
            aria-expanded={menuOpen}
            aria-label={appName}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-foreground/10 text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            {menuOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div className="border-foreground/[0.06] border-t px-4 pb-4 md:hidden">
          <div className="flex flex-col py-2">
            {links.map((link) => (
              <a
                className="rounded-lg px-3 py-3 text-foreground/70 text-sm transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                href={link.href}
                key={link.href}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            {secondaryAction ? (
              <a
                className="rounded-lg px-3 py-3 text-foreground/70 text-sm transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                href={secondaryAction.href}
                onClick={() => setMenuOpen(false)}
              >
                {secondaryAction.label}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}
