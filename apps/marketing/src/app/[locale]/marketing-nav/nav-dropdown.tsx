'use client';

import { ChevronDownIcon } from '@tuturuuu/icons/lucide-static';
import { cn } from '@tuturuuu/utils/format';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

export interface NavMenu {
  id: string;
  label: ReactNode;
  /** Panel width in px. Declared rather than measured so the sheet can resize
   *  before the incoming content has painted. */
  width: number;
  content: ReactNode;
}

interface NavMenuBarProps {
  menus: NavMenu[];
  /** Plain links rendered after the menu triggers. */
  children?: ReactNode;
  ariaLabel: string;
}

const CLOSE_GRACE_MS = 140;

/**
 * Menu bar with a single shared dropdown surface.
 *
 * Previously each dropdown owned its own open state plus a close delay, so
 * sweeping the pointer from one trigger to the next left both panels on screen
 * at once, overlapping. Here exactly one menu can be open — the state is a
 * single id — and one sheet slides and resizes between triggers while its
 * contents cross-fade. Overlap is impossible by construction, and switching
 * reads as one object moving rather than two panels fighting.
 */
export function NavMenuBar({ menus, children, ariaLabel }: NavMenuBarProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  const barRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const panelRefs = useRef(new Map<string, HTMLDivElement>());
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sheet, setSheet] = useState({ x: 0, width: 0, height: 0 });

  const openMenu = menus.find((menu) => menu.id === openId) ?? null;

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenId(null), CLOSE_GRACE_MS);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  // Park the sheet under the active trigger, clamped into the viewport.
  useLayoutEffect(() => {
    if (!openMenu) return;

    const measure = () => {
      const bar = barRef.current;
      const trigger = triggerRefs.current.get(openMenu.id);
      if (!(bar && trigger)) return;

      const barRect = bar.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const margin = 16;

      // Never let the sheet exceed the viewport: the Products panel is wider
      // than the narrowest screen that still shows the desktop menu.
      const width = Math.min(openMenu.width, window.innerWidth - margin * 2);
      const maxX = window.innerWidth - margin - width - barRect.left;
      const minX = margin - barRect.left;

      setSheet({
        x: Math.round(
          Math.max(minX, Math.min(triggerRect.left - barRect.left, maxX))
        ),
        width,
        height: panelRefs.current.get(openMenu.id)?.offsetHeight ?? 0,
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    const panel = panelRefs.current.get(openMenu.id);
    if (panel) observer.observe(panel);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [openMenu]);

  // Escape closes and returns focus to the trigger that opened the sheet.
  useEffect(() => {
    if (!openId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      triggerRefs.current.get(openId)?.focus();
      setOpenId(null);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpenId(null);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [openId]);

  const isOpen = Boolean(openMenu);

  return (
    <nav
      aria-label={ariaLabel}
      className="relative flex items-center"
      onPointerLeave={scheduleClose}
      ref={barRef}
    >
      {menus.map((menu) => {
        const active = openId === menu.id;

        return (
          <button
            aria-controls={`nav-sheet-${menu.id}`}
            aria-expanded={active}
            className={cn(
              'inline-flex h-9 items-center gap-1 rounded-lg px-3 font-medium text-sm transition-colors',
              'text-foreground/70 hover:bg-foreground/5 hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active && 'bg-foreground/5 text-foreground'
            )}
            key={menu.id}
            onClick={() => setOpenId(active ? null : menu.id)}
            onFocus={() => {
              cancelClose();
              setOpenId(menu.id);
            }}
            onPointerEnter={() => {
              cancelClose();
              setOpenId(menu.id);
            }}
            ref={(node) => {
              if (node) triggerRefs.current.set(menu.id, node);
              else triggerRefs.current.delete(menu.id);
            }}
            type="button"
          >
            {menu.label}
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </button>
        );
      })}

      {children}

      <div
        hidden={!isOpen}
        className="absolute top-full left-0 z-50 pt-2"
        style={{ transform: `translateX(${sheet.x}px)`, width: sheet.width }}
      >
        <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-popover text-popover-foreground shadow-xl">
          {menus.map((menu) => (
            <div
              hidden={openId !== menu.id}
              id={`nav-sheet-${menu.id}`}
              key={menu.id}
              ref={(node) => {
                if (node) panelRefs.current.set(menu.id, node);
                else panelRefs.current.delete(menu.id);
              }}
            >
              {menu.content}
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
