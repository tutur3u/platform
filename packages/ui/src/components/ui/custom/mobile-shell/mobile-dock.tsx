'use client';

import { ChevronLeft } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useEffect, useRef } from 'react';
import { attachDockViewportAnchor } from './dock-viewport-anchor';

/** Hold time that turns a Back press into "return to the destination root". */
export const MOBILE_DOCK_LONG_PRESS_MS = 500;

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

export interface MobileDockBack {
  label: string;
  onBack: () => void;
  /** Long-press: return to the current destination's root. */
  onLongPress?: () => void;
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
  'flex h-13 min-w-0 flex-1 items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 motion-reduce:transition-none [&_svg]:size-5.5 [&_svg]:shrink-0';

/**
 * The floating bottom dock of the mobile shell, matching the native app's:
 * up to five icon-only destinations (each named for assistive technology) in
 * a pill and, below a destination's root, a detached circular Back button
 * on its leading side. The Back lane is reserved on every destination, so
 * the pill keeps its place and size whether Back shows or not. The shell
 * decides when the dock shows (sorbet-surfaces.css shows it on phones while
 * Sorbet is on) and reserves the dock clearance under scrolling content;
 * attachDockViewportAnchor keeps it on the visible bottom edge after an app
 * switch or toolbar change.
 *
 * Framework-free: pass `renderLink` to route through the app's link component.
 */
export function MobileDock({
  items,
  back,
  label,
  renderLink = defaultRenderLink,
}: {
  items: MobileDockItem[];
  back?: MobileDockBack;
  label: string;
  renderLink?: (props: MobileDockLinkProps) => ReactNode;
}) {
  useEffect(() => attachDockViewportAnchor(window), []);

  return (
    <>
      <div aria-hidden data-slot="mobile-dock-fade" className="hidden" />
      <nav
        aria-label={label}
        data-slot="mobile-dock"
        data-has-back={back ? 'true' : undefined}
        className="hidden"
      >
        <div data-slot="mobile-dock-back-lane">
          {back && <DockBack {...back} />}
        </div>
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

function DockBack({ label, onBack, onLongPress }: MobileDockBack) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <button
      type="button"
      aria-label={label}
      data-slot="mobile-dock-back"
      className="flex size-full items-center justify-center rounded-full text-foreground transition-colors duration-150 hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 motion-reduce:transition-none"
      onPointerDown={() => {
        longPressed.current = false;
        if (!onLongPress) return;
        clear();
        timer.current = setTimeout(() => {
          longPressed.current = true;
          onLongPress();
        }, MOBILE_DOCK_LONG_PRESS_MS);
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onBack();
      }}
    >
      <ChevronLeft className="size-6" strokeWidth={2.25} />
    </button>
  );
}
