'use client';

import { ChevronDown, ChevronUp, Video } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useActivitiesRequest } from './activities-request';
import { ActivityLayer } from './activity-layer';
import { layoutGeometry, type Rect, rectStyle } from './layout-geometry';
import { countPanes, paneLeaves, resizeBoundary } from './layout-model';
import { LayoutSeparator, STAGE_GUTTER } from './layout-separator';
import {
  type ActivityMeta,
  PANE_HEADER_HEIGHT,
  PaneChrome,
  panelId,
  tabId,
} from './pane-chrome';
import { PhoneSwitcher } from './phone-switcher';
import type { StageLayoutController } from './use-stage-layout';
import { useStageFullscreen } from './use-stage-fullscreen';

export interface StageActivity {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  content: ReactNode;
}

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Where the people sit: filling the stage, in a row above panes, a pill, or,
 * while a pane is maximized, a small overlay on top of it.
 */
export type VideoStripMode = 'full' | 'row' | 'pill' | 'overlay';

export function videoStripMode(
  hasPanes: boolean,
  controller: Pick<StageLayoutController, 'strip' | 'tier'>,
  maximized = false
): VideoStripMode {
  if (!hasPanes) return 'full';
  if (maximized && controller.tier !== 'phone') return 'overlay';
  if (controller.strip !== 'auto') return controller.strip;
  return controller.tier === 'desktop' ? 'row' : 'pill';
}

/**
 * The room stage: the call's people plus every open activity. The people
 * stay mounted in one place whatever the activities do, so audio and video
 * never restart. Panes are placed from fractions of the area, never nested,
 * so splitting, resizing, maximizing and reordering keep every activity
 * mounted.
 */
export function StageLayoutView({
  controller,
  activities,
  stage,
  peopleCount,
}: {
  controller: StageLayoutController;
  activities: readonly StageActivity[];
  /** The call's people. Always rendered, wherever the strip puts them. */
  stage: ReactNode;
  peopleCount: number;
}) {
  const t = useTranslations('meet.call.stage_layout');
  const { tier } = controller;
  const activitiesRequest = useActivitiesRequest();
  // A drag previews here and is saved on release, so the call around the
  // stage does not re-render for every pointer move.
  const [drag, setDrag] = useState<{
    splitId: string;
    index: number;
    position: number;
  } | null>(null);
  const layout = useMemo(
    () =>
      drag
        ? resizeBoundary(
            controller.layout,
            drag.splitId,
            drag.index,
            drag.position
          )
        : controller.layout,
    [controller.layout, drag]
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [peopleHidden, setPeopleHidden] = useState(false);
  const [slots, setSlots] = useState<Record<string, HTMLElement | null>>({});
  const [switcher, setSwitcher] = useState(false);
  const onSlot = useCallback(
    (paneId: string, element: HTMLElement | null) =>
      setSlots((current) =>
        current[paneId] === element
          ? current
          : { ...current, [paneId]: element }
      ),
    []
  );
  const byId = useMemo(
    () => new Map(activities.map((activity) => [activity.id, activity])),
    [activities]
  );
  const meta = useCallback(
    (id: string): ActivityMeta => {
      const found = byId.get(id);
      return found ?? { id, title: id, icon: () => null };
    },
    [byId]
  );
  const panes = paneLeaves(layout.root);
  const geometry = useMemo(() => layoutGeometry(layout), [layout]);
  const hasPanes = panes.length > 0;
  const paneCount = countPanes(layout);
  const maximizedId = layout.maximizedPaneId;
  const mode = videoStripMode(hasPanes, controller, !!maximizedId);
  const phone = tier === 'phone';
  // Following someone shows their arrangement; rearranging waits until the
  // person leaves follow mode.
  const locked = controller.locked;
  const full = useStageFullscreen({
    root: rootRef,
    maximizedId,
    maximize: controller.maximize,
  });
  const canFullscreen = full.supported && !phone && !locked;

  const rectOf = (paneId: string) =>
    paneId === maximizedId ? FULL : (geometry.panes[paneId] ?? FULL);
  const hiddenPane = (paneId: string) =>
    !!maximizedId && paneId !== maximizedId;
  const gutter = maximizedId ? 0 : STAGE_GUTTER;
  const toggleMaximize = (paneId: string) =>
    controller.maximize(maximizedId === paneId ? null : paneId);

  const focusedPaneId = layout.focusedPaneId ?? panes[0]?.id;
  // Shift+Alt+Enter toggles fullscreen from anywhere in the stage, the code
  // editor included, which is why it is read in the capture phase.
  const fullscreenKey = (event: KeyboardEvent) => {
    if (
      !canFullscreen ||
      !focusedPaneId ||
      event.key !== 'Enter' ||
      !event.shiftKey ||
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    event.preventDefault();
    full.toggle(focusedPaneId);
  };
  const cycleFocus = (event: KeyboardEvent) => {
    if (event.key !== 'F6' || panes.length < 2) return;
    event.preventDefault();
    const index = panes.findIndex((pane) => pane.id === layout.focusedPaneId);
    const target =
      panes[(index + (event.shiftKey ? -1 : 1) + panes.length) % panes.length];
    if (!target) return;
    controller.focusPane(target.id);
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-pane-id="${target.id}"]`)
      ?.focus();
  };

  const overlayHidden = mode === 'overlay' && peopleHidden;
  const focusedPane = panes.find((pane) => pane.id === layout.focusedPaneId);
  const switchItems = useMemo(
    () => controller.openIds.map(meta),
    [controller.openIds, meta]
  );
  const open = (id: string) => {
    const pane = panes.find((entry) => entry.tabs.includes(id));
    if (pane) controller.activate(pane.id, id);
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        'relative flex h-full min-h-0 min-w-0 flex-col gap-2',
        full.fullscreen && 'bg-background p-2'
      )}
    >
      {stage != null && (
        <div
          aria-hidden={mode === 'pill' || overlayHidden || undefined}
          inert={mode === 'pill' || overlayHidden || undefined}
          className={cn(
            'relative min-w-0',
            mode === 'full' && 'min-h-0 flex-1',
            mode === 'row' && 'h-32 shrink-0',
            mode === 'pill' && 'h-0 overflow-hidden',
            mode === 'overlay' &&
              'absolute right-3 bottom-3 z-30 h-28 w-48 overflow-hidden rounded-2xl border bg-background shadow-elevation-2',
            overlayHidden && 'h-0 w-0 border-0'
          )}
        >
          {stage}
          {mode === 'overlay' && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute top-1 right-1 size-7 rounded-full bg-background/80 backdrop-blur"
              aria-label={t('video_hide')}
              title={t('video_hide')}
              onClick={() => setPeopleHidden(true)}
            >
              <ChevronDown aria-hidden="true" className="size-4" />
            </Button>
          )}
          {mode === 'row' && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute top-1 right-1 size-7 rounded-full bg-background/80 backdrop-blur"
              aria-label={t('video_hide')}
              title={t('video_hide')}
              onClick={() => controller.setStrip('pill')}
            >
              <ChevronUp aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>
      )}
      {stage != null && overlayHidden && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="absolute right-3 bottom-3 z-30 h-8 gap-1.5 rounded-full bg-background px-3"
          aria-label={t('video_show')}
          onClick={() => setPeopleHidden(false)}
        >
          <Video aria-hidden="true" className="size-4" />
          {t('video_count', { count: peopleCount })}
          <ChevronUp aria-hidden="true" className="size-4" />
        </Button>
      )}
      {stage != null && mode === 'pill' && (
        <div className="flex shrink-0 justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-full px-3"
            aria-label={t('video_show')}
            onClick={() => controller.setStrip('row')}
          >
            <Video aria-hidden="true" className="size-4" />
            {t('video_count', { count: peopleCount })}
            <ChevronDown aria-hidden="true" className="size-4" />
          </Button>
        </div>
      )}
      {hasPanes && (
        <div
          ref={containerRef}
          role="group"
          aria-label={t('region')}
          className="relative min-h-0 flex-1"
          onKeyDownCapture={fullscreenKey}
          onKeyDown={cycleFocus}
        >
          {panes.map((pane) => (
            <PaneChrome
              key={pane.id}
              pane={pane}
              meta={meta}
              style={rectStyle(rectOf(pane.id), gutter)}
              focused={paneCount > 1 && pane.id === layout.focusedPaneId}
              current={pane.id === layout.focusedPaneId}
              hidden={hiddenPane(pane.id)}
              maximized={pane.id === maximizedId}
              reorderable={paneCount > 1 && !phone && !locked}
              canMaximize={!phone && !locked}
              locked={locked}
              fullscreen={full.fullscreen}
              onToggleFullscreen={canFullscreen ? full.toggle : undefined}
              onSlot={onSlot}
              onFocus={controller.focusPane}
              onActivate={controller.activate}
              onMove={controller.movePane}
              onMoveTab={controller.moveTab}
              onSwap={controller.swapPanes}
              onToggleMaximize={toggleMaximize}
              onClose={controller.close}
              onSwitcher={
                phone && !locked && controller.openIds.length > 1
                  ? () => setSwitcher(true)
                  : undefined
              }
            />
          ))}
          {!maximizedId &&
            !locked &&
            geometry.boundaries.map((boundary) => (
              <LayoutSeparator
                key={boundary.key}
                boundary={boundary}
                label={t('resize', {
                  first: meta(
                    panes.find((pane) => pane.id === boundary.before)?.active ??
                      ''
                  ).title,
                  second: meta(
                    panes.find((pane) => pane.id === boundary.after)?.active ??
                      ''
                  ).title,
                })}
                extent={() => {
                  const box = containerRef.current?.getBoundingClientRect();
                  if (!box) return 0;
                  return boundary.axis === 'row'
                    ? box.width * boundary.span.w
                    : box.height * boundary.span.h;
                }}
                onPreview={(position) =>
                  setDrag({
                    splitId: boundary.splitId,
                    index: boundary.index,
                    position,
                  })
                }
                onCancel={() => setDrag(null)}
                onCommit={(position) => {
                  setDrag(null);
                  controller.resize(boundary.splitId, boundary.index, position);
                }}
                onReset={() =>
                  controller.reset(boundary.splitId, boundary.index)
                }
              />
            ))}
          {[...activities]
            .sort((a, b) => (a.id < b.id ? -1 : 1))
            .map((activity) => {
              const pane = panes.find((entry) =>
                entry.tabs.includes(activity.id)
              );
              if (!pane) return null;
              const hidden = hiddenPane(pane.id);
              return (
                <ActivityLayer
                  key={activity.id}
                  activityId={activity.id}
                  title={activity.title}
                  style={rectStyle(rectOf(pane.id), gutter, {
                    top: PANE_HEADER_HEIGHT,
                    left: 1,
                    right: 1,
                    bottom: 1,
                  })}
                  visible={!hidden && pane.active === activity.id}
                  maximized={pane.id === maximizedId}
                  slot={slots[pane.id] ?? null}
                  canMaximize={!phone && !locked && pane.id !== maximizedId}
                  tab={
                    pane.tabs.length > 1 &&
                    !(phone && !locked && switchItems.length > 1)
                      ? {
                          panelId: panelId(activity.id),
                          tabId: tabId(pane.id, activity.id),
                        }
                      : undefined
                  }
                  onToggleMaximize={() => toggleMaximize(pane.id)}
                  onClose={() => controller.close(activity.id)}
                >
                  {activity.content}
                </ActivityLayer>
              );
            })}
        </div>
      )}
      {phone && (
        <PhoneSwitcher
          open={switcher}
          onOpenChange={setSwitcher}
          items={switchItems}
          currentId={focusedPane?.active ?? null}
          onSelect={open}
          onBrowse={
            activitiesRequest?.available ? activitiesRequest.request : undefined
          }
        />
      )}
    </div>
  );
}
