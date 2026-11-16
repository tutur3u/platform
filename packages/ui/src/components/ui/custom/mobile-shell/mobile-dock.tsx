'use client';

import { ChevronLeft } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useRef } from 'react';

/** Hold time that turns a Back press into "return to the destination root". */
export const MOBILE_DOCK_LONG_PRESS_MS = 500;

export interface MobileDockItem {
  key: string;
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
  'aria-current'?: 'page';
  children: ReactNode;
}

const defaultRenderLink = ({ href, ...props }: MobileDockLinkProps) => (
  <a href={href} {...props} />
);

const slotClassName =
  'flex h-13 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-xs leading-tight transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 motion-reduce:transition-none [&_svg]:size-5.5 [&_svg]:shrink-0';

/**
 * The floating bottom dock of the mobile shell: up to five destinations and,
 * below a destination's root, a leading Back slot. The frame keeps its place
 * and size in every state; only the slots inside it change. The shell decides
 * when the dock shows (sorbet-surfaces.css shows it on phones while Sorbet is
 * on) and reserves `--mobile-dock-clearance` under scrolling content.
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
  return (
    <>
      <div aria-hidden data-slot="mobile-dock-fade" className="hidden" />
      <nav
        aria-label={label}
        data-slot="mobile-dock"
        data-has-back={back ? 'true' : undefined}
        className="hidden"
      >
        {back && <DockBack {...back} />}
        {items.slice(0, 5).map((item) => {
          const className = cn(
            slotClassName,
            item.active
              ? 'bg-accent font-extrabold text-foreground'
              : 'font-semibold text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
          );
          const content = (
            <>
              {item.icon}
              <span className="max-w-full truncate">{item.label}</span>
            </>
          );
          return (
            <div key={item.key} className="contents">
              {item.href ? (
                renderLink({
                  href: item.href,
                  className,
                  'aria-current': item.active ? 'page' : undefined,
                  children: content,
                })
              ) : (
                <button
                  type="button"
                  className={className}
                  aria-current={item.active ? 'page' : undefined}
                  onClick={item.onSelect}
                >
                  {content}
                </button>
              )}
            </div>
          );
        })}
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
    <>
      <button
        type="button"
        aria-label={label}
        data-slot="mobile-dock-back"
        className="flex size-13 shrink-0 items-center justify-center rounded-full bg-accent text-foreground transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 motion-reduce:transition-none"
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
      <span aria-hidden className="h-7 w-px shrink-0 bg-border" />
    </>
  );
}
