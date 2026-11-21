'use client';

import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useEffect } from 'react';
import { attachDockViewportAnchor } from './dock-viewport-anchor';

export interface MobileDockItem {
  key: string;
  /** Accessible name; the dock shows icons only, like the native app. */
  label: string;
  icon: ReactNode;
  active?: boolean;
  /** Renders a link through `renderLink`; omit to render a button. */
  href?: string;
  onSelect?: () => void;
}

export interface MobileDockLinkProps {
  href: string;
  className: string;
  'aria-label': string;
  'aria-current'?: 'page';
  children: ReactNode;
}

const defaultRenderLink = ({ href, ...props }: MobileDockLinkProps) => (
  <a href={href} {...props} />
);

const slotClassName =
  'flex h-13 min-w-0 min-h-[var(--sorbet-touch-target,44px)] flex-1 items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 motion-reduce:transition-none [&_svg]:size-5.5 [&_svg]:shrink-0';

/**
 * The floating bottom dock of the mobile web shell: up to five icon-only
 * destinations in a centered pill. Browser history owns Back on the web; the
 * native Flutter shell keeps its own dock Back. The shell decides when the dock
 * shows (sorbet-surfaces.css on phones while Sorbet is on) and reserves dock
 * clearance under scrolling content; attachDockViewportAnchor keeps the dock on
 * the visible bottom edge after an app switch or toolbar change.
 *
 * Framework-free: pass `renderLink` to route through the app's link component.
 */
export function MobileDock({
  items,
  label,
  renderLink = defaultRenderLink,
}: {
  items: MobileDockItem[];
  label: string;
  renderLink?: (props: MobileDockLinkProps) => ReactNode;
}) {
  useEffect(() => attachDockViewportAnchor(window), []);

  return (
    <>
      <div aria-hidden data-slot="mobile-dock-fade" className="hidden" />
      <nav aria-label={label} data-slot="mobile-dock" className="hidden">
        <div data-slot="mobile-dock-pill">
          {items.slice(0, 5).map((item) => {
            const className = cn(
              slotClassName,
              item.active
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
            );
            const content = item.icon;
            return (
              <div key={item.key} className="contents">
                {item.href ? (
                  renderLink({
                    href: item.href,
                    className,
                    'aria-label': item.label,
                    'aria-current': item.active ? 'page' : undefined,
                    children: content,
                  })
                ) : (
                  <button
                    type="button"
                    className={className}
                    aria-label={item.label}
                    aria-current={item.active ? 'page' : undefined}
                    onClick={item.onSelect}
                  >
                    {content}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </nav>
    </>
  );
}
