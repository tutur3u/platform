'use client';

import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useEffect, useRef, useState } from 'react';

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
 *
 * Scroll progress is written straight to a CSS variable inside a rAF rather
 * than held in state, so continuous scrolling never re-renders the tree.
 */
export function MarketingNavShell({
  logo,
  menu,
  actions,
}: MarketingNavShellProps) {
  const [scrolled, setScrolled] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      frame.current = null;

      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;
      const progress =
        scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0;

      progressRef.current?.style.setProperty(
        'transform',
        `scaleX(${progress.toFixed(4)})`
      );
      setScrolled(window.scrollY > 8);
    };

    const handleScroll = () => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4"
      id="navbar"
    >
      <div
        className={cn(
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

        {/* Reading progress */}
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 h-px origin-left bg-[linear-gradient(90deg,var(--purple),var(--blue),var(--cyan))] transition-opacity duration-500',
            scrolled ? 'opacity-90' : 'opacity-0'
          )}
          ref={progressRef}
          style={{ transform: 'scaleX(0)' }}
        />
      </div>
    </header>
  );
}
