'use client';

import { Maximize2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type CSSProperties, type ReactNode, useMemo, useState } from 'react';
import {
  ActivityPaneContext,
  type ActivityPaneValue,
} from './activity-pane-context';
import { usePaneSize } from './use-pane-size';

/**
 * One activity's content, positioned over its pane's body. It stays mounted
 * while it is a hidden tab, in a pane another pane has maximized over, or too
 * small to use, so editors keep their collaboration state; it is only hidden
 * and told it is no longer active.
 */
export function ActivityLayer({
  activityId,
  title,
  style,
  visible,
  maximized,
  slot,
  canMaximize,
  onToggleMaximize,
  onClose,
  children,
}: {
  activityId: string;
  title: string;
  style: CSSProperties;
  /** The active tab of a pane that is on screen. */
  visible: boolean;
  maximized: boolean;
  slot: HTMLElement | null;
  canMaximize: boolean;
  onToggleMaximize: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useTranslations('meet.call.stage_layout');
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const { sizeClass, tooSmall } = usePaneSize(element);
  const active = visible && !tooSmall;
  const value = useMemo<ActivityPaneValue>(
    () => ({
      activityId,
      title,
      active,
      visible,
      sizeClass,
      maximized,
      headerSlot: slot,
      toggleMaximize: onToggleMaximize,
      close: onClose,
    }),
    [
      activityId,
      title,
      active,
      visible,
      sizeClass,
      maximized,
      slot,
      onToggleMaximize,
      onClose,
    ]
  );
  return (
    <div
      ref={setElement}
      data-activity-id={activityId}
      data-size={sizeClass}
      inert={!visible || undefined}
      style={style}
      className={cn(
        '@container absolute overflow-hidden rounded-b-[calc(var(--radius-2xl)-1px)] bg-card [contain:layout_paint]',
        !visible && 'invisible'
      )}
    >
      <div
        inert={tooSmall || undefined}
        className={cn('size-full', tooSmall && 'invisible')}
      >
        <ActivityPaneContext.Provider value={value}>
          {children}
        </ActivityPaneContext.Provider>
      </div>
      {visible && tooSmall && (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card p-3 text-center"
        >
          <Maximize2
            aria-hidden="true"
            className="size-5 text-muted-foreground"
          />
          <p className="font-semibold text-sm">{t('needs_room_title')}</p>
          <p className="text-muted-foreground text-xs">
            {t('needs_room_description')}
          </p>
          {canMaximize && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-full px-3.5"
              onClick={onToggleMaximize}
            >
              {t('needs_room_action')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
