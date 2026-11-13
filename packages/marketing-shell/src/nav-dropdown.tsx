'use client';

import { useStaticMarketingMotion } from './use-static-motion';
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
  /** Panel width in px, declared so the sheet can resize before paint. */
  width: number;
  content: ReactNode;
}

const CLOSE_GRACE_MS = 140;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/**
 * Menu bar with one shared dropdown sheet that slides and resizes between
 * triggers (only one menu can be open). Ported from apps/marketing; CSS
 * transitions replace framer-motion springs so the package has no motion
 * dependency, and `prefers-reduced-motion` turns them off.
 */
export function NavMenuBar({
  menus,
  children,
  ariaLabel,
}: {
  menus: NavMenu[];
  children?: ReactNode;
  ariaLabel: string;
}) {
  const staticMotion = useStaticMarketingMotion();
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

  useLayoutEffect(() => {
    if (!openMenu) return;
    const measure = () => {
      const bar = barRef.current;
      const trigger = triggerRefs.current.get(openMenu.id);
      if (!(bar && trigger)) return;
      const barRect = bar.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const margin = 16;
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
            }}
            onPointerEnter={() => {
              cancelClose();
            }}
            ref={(node) => {
              if (node) triggerRefs.current.set(menu.id, node);
              else triggerRefs.current.delete(menu.id);
            }}
            type="button"
          >
            {menu.label}
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={active ? 'rotate-180' : undefined}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        );
      })}

      {children}

      <div
        hidden={!isOpen}
        className={cn(
          'absolute top-full left-0 z-50 pt-2 motion-reduce:transition-none',
          isOpen ? 'pointer-events-auto' : 'pointer-events-none'
        )}
        style={{
          width: sheet.width || undefined,
          opacity: isOpen ? 1 : 0,
          transform: `translate(${sheet.x}px, ${isOpen ? 0 : -4}px)`,
          transition: staticMotion
            ? undefined
            : `transform 0.32s ${EASE}, width 0.32s ${EASE}, opacity 0.16s ease`,
        }}
      >
        <div
          className="overflow-hidden rounded-2xl border border-foreground/10 bg-popover text-popover-foreground shadow-foreground/5 shadow-xl motion-reduce:transition-none"
          style={{
            height: sheet.height || 'auto',
            transition: staticMotion ? undefined : `height 0.32s ${EASE}`,
          }}
        >
          <div className="relative">
            {menus.map((menu) => (
              <div
                hidden={openId !== menu.id}
                aria-hidden={openId !== menu.id}
                className={cn(
                  'top-0 left-0 w-full transition-opacity duration-200',
                  openId === menu.id
                    ? 'relative opacity-100'
                    : 'pointer-events-none absolute opacity-0'
                )}
                id={`nav-sheet-${menu.id}`}
                key={menu.id}
                ref={(node) => {
                  if (node) panelRefs.current.set(menu.id, node);
                  else panelRefs.current.delete(menu.id);
                }}
                style={{ width: menu.width, maxWidth: '100%' }}
              >
                {menu.content}
              </div>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
