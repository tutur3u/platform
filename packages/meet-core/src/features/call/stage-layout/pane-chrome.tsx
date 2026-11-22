'use client';

import { ChevronDown, GripVertical } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  type ComponentType,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  useCallback,
} from 'react';
import { PaneWindowActions } from './activity-shell';
import { activityTone } from './activity-tones';
import type { PaneNode } from './layout-model';

export const PANE_HEADER_HEIGHT = 44;
export const PANE_DRAG_TYPE = 'application/x-meet-stage-pane';

export interface ActivityMeta {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
}

/**
 * A pane's frame: grip, tabs (or the lone activity's title), the slot where
 * the active activity puts its status and actions, maximize and close. The
 * activities themselves render in a separate layer so moving or reshaping a
 * pane never remounts them.
 */
export function PaneChrome({
  pane,
  meta,
  style,
  focused,
  current,
  hidden,
  maximized,
  reorderable,
  canMaximize,
  onSlot,
  onFocus,
  onActivate,
  onMove,
  onMoveTab,
  onSwap,
  onToggleMaximize,
  onClose,
  onSwitcher,
}: {
  pane: PaneNode;
  meta: (id: string) => ActivityMeta;
  style: CSSProperties;
  /** Drawn with the focus ring: the focused pane among several. */
  focused: boolean;
  /** The layout's focused pane, even when it is the only one. */
  current: boolean;
  hidden: boolean;
  maximized: boolean;
  reorderable: boolean;
  canMaximize: boolean;
  onSlot: (paneId: string, element: HTMLElement | null) => void;
  onFocus: (paneId: string) => void;
  onActivate: (paneId: string, activityId: string) => void;
  onMove: (paneId: string, step: -1 | 1) => void;
  onMoveTab: (activityId: string, step: -1 | 1) => void;
  onSwap: (first: string, second: string) => void;
  onToggleMaximize: (paneId: string) => void;
  onClose: (activityId: string) => void;
  /** Phone only: opens the sheet that switches between open activities. */
  onSwitcher?: () => void;
}) {
  const t = useTranslations('meet.call.stage_layout');
  const active = meta(pane.active);
  const slotRef = useCallback(
    (element: HTMLElement | null) => onSlot(pane.id, element),
    [onSlot, pane.id]
  );
  const gripKey = (event: KeyboardEvent) => {
    const step =
      event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? -1
        : event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : 0;
    if (!step) return;
    event.preventDefault();
    onMove(pane.id, step);
  };
  const tabKey = (event: KeyboardEvent, id: string) => {
    const step =
      event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    if (event.altKey) return onMoveTab(id, step);
    const next = pane.tabs[pane.tabs.indexOf(id) + step];
    if (!next) return;
    onActivate(pane.id, next);
    requestAnimationFrame(() =>
      document.getElementById(tabId(pane.id, next))?.focus()
    );
  };
  const dragOver = (event: DragEvent) => {
    if (event.dataTransfer.types.includes(PANE_DRAG_TYPE))
      event.preventDefault();
  };
  const drop = (event: DragEvent) => {
    const from = event.dataTransfer.getData(PANE_DRAG_TYPE);
    if (!from) return;
    event.preventDefault();
    onSwap(from, pane.id);
  };
  return (
    <section
      aria-label={active.title}
      data-pane-id={pane.id}
      data-focused={focused || undefined}
      tabIndex={-1}
      inert={hidden || undefined}
      style={style}
      className={cn(
        '@container absolute flex flex-col overflow-hidden rounded-2xl border bg-card shadow-elevation-1 outline-none',
        focused ? 'border-ring ring-2 ring-ring' : 'border-border',
        'focus-visible:ring-2 focus-visible:ring-ring',
        hidden && 'invisible'
      )}
      onPointerDownCapture={() => !current && onFocus(pane.id)}
      onFocusCapture={() => !current && onFocus(pane.id)}
      onDragOver={dragOver}
      onDrop={drop}
    >
      <header
        className="flex shrink-0 items-center gap-2 border-b px-2"
        style={{ height: PANE_HEADER_HEIGHT - 1 }}
      >
        {reorderable && (
          <button
            type="button"
            draggable
            aria-label={t('move', { title: active.title })}
            title={t('move_hint')}
            className="grid h-7 w-5 shrink-0 cursor-grab place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            onKeyDown={gripKey}
            onDragStart={(event) => {
              event.dataTransfer.setData(PANE_DRAG_TYPE, pane.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
        )}
        {onSwitcher ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 min-w-0 gap-2 rounded-full px-2 font-semibold"
            aria-haspopup="dialog"
            onClick={onSwitcher}
          >
            <active.icon aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{active.title}</span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
          </Button>
        ) : pane.tabs.length > 1 ? (
          <div
            role="tablist"
            aria-label={t('tabs')}
            className="flex min-w-0 shrink items-center gap-1 overflow-x-auto"
          >
            {pane.tabs.map((id) => {
              const tab = meta(id);
              const selected = id === pane.active;
              return (
                <button
                  key={id}
                  id={tabId(pane.id, id)}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={panelId(id)}
                  tabIndex={selected ? 0 : -1}
                  className={cn(
                    'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 font-semibold text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:bg-accent/60'
                  )}
                  onClick={() => onActivate(pane.id, id)}
                  onKeyDown={(event) => tabKey(event, id)}
                >
                  <tab.icon aria-hidden="true" className="size-4" />
                  {tab.title}
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <span
              aria-hidden="true"
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-lg',
                activityTone(pane.active)
              )}
            >
              <active.icon className="size-4" />
            </span>
            <h2 className="min-w-0 truncate font-semibold text-sm">
              {active.title}
            </h2>
          </>
        )}
        <div
          ref={slotRef}
          className="flex min-w-0 flex-1 items-center justify-end gap-2 overflow-hidden"
        />
        <PaneWindowActions
          title={active.title}
          canMaximize={canMaximize}
          maximized={maximized}
          onToggleMaximize={() => onToggleMaximize(pane.id)}
          onClose={() => onClose(pane.active)}
        />
      </header>
    </section>
  );
}

export const panelId = (activityId: string) =>
  `stage-panel-${activityId.replace(/[^a-z0-9_-]/gi, '_')}`;

export const tabId = (paneId: string, activityId: string) =>
  `stage-tab-${paneId}-${activityId.replace(/[^a-z0-9_-]/gi, '_')}`;
