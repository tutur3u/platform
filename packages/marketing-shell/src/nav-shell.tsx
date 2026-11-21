'use client';

import { useStaticMarketingMotion } from './use-static-motion';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useEffect, useState } from 'react';

interface MarketingNavShellProps {
  logo: ReactNode;
  menu: ReactNode;
  actions: ReactNode;
  /**
   * `overlay` floats the bar over a full-bleed page (marketing routes).
   * `column` pins it to the top of a scrolling column that is not the
   * viewport — the docs shell, where the sidebar owns the left edge.
   */
  placement?: 'overlay' | 'column';
  /** Shorter bar (pt-2 + h-11). The page docks its own bar in the space freed. */
  compact?: boolean;
}

/**
 * Floating capsule navbar for marketing routes. It is transparent at the top
 * of the page and gains a surface, ring and (on capable desktops) a backdrop
 * blur once the page scrolls; compact and column bars always have one. The
 * scroll state lives in React and is applied where it is read.
 */
export function MarketingNavShell({
  logo,
  menu,
  actions,
  placement = 'overlay',
  compact = false,
}: MarketingNavShellProps) {
  const staticMotion = useStaticMarketingMotion();
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

  const surfaced = scrolled || compact || placement === 'column';

  return (
    <header
      className={cn(
        'z-50 px-3 sm:px-4',
        compact ? 'pt-2' : 'pt-3 sm:pt-4',
        placement === 'overlay'
          ? 'fixed inset-x-0 top-0'
          : // Sticky rather than fixed: the docs column scrolls inside the
            // page, so a fixed bar would detach from it.
            'sticky top-0 w-full'
      )}
      id="navbar"
    >
      <div
        className={cn(
          // A floating-bar capsule: padding, control height and both radii
          // come from the floating-bar tokens. overflow-visible lets the
          // Products/Resources and preference panels escape the bar.
          'relative mx-auto flex max-w-7xl items-center justify-between gap-(--bar-gap) overflow-visible rounded-(--radius-bar) px-(--bar-padding)',
          'transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none',
          compact ? 'h-11' : 'h-14',
          // 56px bar = 36px controls + 10px padding; compact keeps the 32px +
          // 6px defaults (44px).
          !compact && '[--bar-control-height:2.25rem] [--bar-padding:0.625rem]',
          // The outline is a ring, never a border, so it appears on scroll
          // without moving anything.
          surfaced
            ? cn(
                'shadow-foreground/5 shadow-md ring-1 ring-border',
                staticMotion
                  ? 'bg-background'
                  : 'bg-background/80 backdrop-blur-xl'
              )
            : 'ring-1 ring-transparent'
        )}
        data-scrolled={surfaced ? '' : undefined}
        data-slot="floating-bar"
        id="navbar-content"
      >
        <div className="flex min-w-0 items-center gap-2 lg:gap-4">
          {logo}
          {/* Mirrors the mobile menu breakpoint so navigation is never absent */}
          <div className="hidden md:block" id="navbar-menu">
            {menu}
          </div>
        </div>

        <div className="flex flex-none items-center gap-(--bar-gap)">
          {actions}
        </div>
      </div>
    </header>
  );
}
