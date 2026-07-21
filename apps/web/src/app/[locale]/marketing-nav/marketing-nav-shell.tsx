'use client';

import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useEffect, useState } from 'react';

interface MarketingNavShellProps {
  logo: ReactNode;
  menu: ReactNode;
  actions: ReactNode;
}

/**
 * Floating pill navbar for marketing routes.
 *
 * Replaces the old approach of imperatively adding/removing classes on
 * `#navbar-content` from a sibling component: the scroll state now lives in
 * React and is applied where it is read.
 */
export function MarketingNavShell({
  logo,
  menu,
  actions,
}: MarketingNavShellProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame: number | null = null;

    const update = () => {
      frame = null;
      setScrolled(window.scrollY > 8);
    };

    const handleScroll = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4"
      id="navbar"
    >
      <div
        className={cn(
          // overflow-visible so the Products/Resources panels can escape the pill
          'relative mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 overflow-visible rounded-2xl px-3 transition-all duration-500 sm:px-4',
          scrolled
            ? 'border border-foreground/10 bg-background/70 shadow-foreground/5 shadow-lg backdrop-blur-xl'
            : 'border border-transparent bg-transparent'
        )}
        id="navbar-content"
      >
        {/* Lit top edge, only once the bar has a surface to light */}
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-foreground/25 to-transparent transition-opacity duration-500',
            scrolled ? 'opacity-100' : 'opacity-0'
          )}
        />

        <div className="flex min-w-0 items-center gap-6">
          {logo}
          {/* Mirrors the mobile <Menu /> breakpoint so navigation is never absent */}
          <div className="hidden md:block">{menu}</div>
        </div>

        <div className="flex flex-none items-center gap-1.5">{actions}</div>
      </div>
    </header>
  );
}
