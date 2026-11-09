'use client';
import { Expand, Shrink, Video, VideoOff } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  clampPosition,
  cornerPosition,
  distance,
  type Insets,
  moveCorner,
  nearestCorner,
  nextSize,
  PIP_MARGIN,
  type PipPrefs,
  pinchSize,
  pipDimensions,
  type Point,
  projectedPosition,
  readPipPrefs,
  type Size,
  writePipPrefs,
} from '../lib/pip-layout';

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

type Drag = {
  pointerId: number;
  origin: Point;
  start: Point;
  position: Point;
  last: { point: Point; at: number };
  velocity: Point;
  moved: boolean;
};
type Pinch = { pointers: Map<number, Point>; startDistance: number };

/**
 * Floating self-preview that behaves like iOS picture-in-picture: drag it
 * anywhere over the stage, release to snap to the nearest corner, pinch or
 * tap to resize through S/M/L presets, and hide it into an edge pill. Corner,
 * size and hidden state persist per device. The card is focusable; arrow keys
 * move it between corners. Positioning happens inside the parent stage, so
 * it never covers the header or the control bar.
 */
export function SelfPreviewPip({
  children,
  label,
  aspectRatio = 16 / 9,
  storage,
  className,
}: {
  children: ReactNode;
  /** Accessible name for the card, e.g. "Your camera". */
  label: string;
  aspectRatio?: number;
  /** Defaults to `localStorage`; pass `null` to disable persistence. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  className?: string;
}) {
  const t = useTranslations('meet.call');
  const resolvedStorage =
    storage === undefined
      ? typeof window === 'undefined'
        ? null
        : window.localStorage
      : storage;
  const [prefs, setPrefs] = useState<PipPrefs>(() =>
    readPipPrefs(resolvedStorage)
  );
  const [container, setContainer] = useState<Size>({ width: 0, height: 0 });
  const [insets, setInsets] = useState<Insets>(NO_INSETS);
  const [drag, setDrag] = useState<Drag | null>(null);
  const pinch = useRef<Pinch | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    writePipPrefs(resolvedStorage, prefs);
  }, [prefs, resolvedStorage]);

  useIsomorphicLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const measure = () => {
      setContainer({
        width: overlay.clientWidth,
        height: overlay.clientHeight,
      });
      const probe = probeRef.current;
      if (probe) {
        const style = getComputedStyle(probe);
        setInsets({
          top: PIP_MARGIN + parseFloat(style.paddingTop || '0'),
          right: PIP_MARGIN + parseFloat(style.paddingRight || '0'),
          bottom: PIP_MARGIN + parseFloat(style.paddingBottom || '0'),
          left: PIP_MARGIN + parseFloat(style.paddingLeft || '0'),
        });
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(overlay);
    return () => observer.disconnect();
  }, []);

  const card = pipDimensions(prefs.size, container, insets, aspectRatio);
  const docked = cornerPosition(prefs.corner, container, card, insets);
  const position = drag ? drag.position : docked;
  const update = useCallback(
    (patch: Partial<PipPrefs>) =>
      setPrefs((current) => ({ ...current, ...patch })),
    []
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, [data-pip-static]'))
      return;
    const point = { x: event.clientX, y: event.clientY };
    const active = pinch.current ?? { pointers: new Map(), startDistance: 0 };
    active.pointers.set(event.pointerId, point);
    if (active.pointers.size === 2) {
      const [a, b] = [...active.pointers.values()];
      active.startDistance = a && b ? distance(a, b) : 0;
      pinch.current = active;
      setDrag(null);
      return;
    }
    pinch.current = active;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional; dragging still follows window events.
    }
    setDrag({
      pointerId: event.pointerId,
      origin: point,
      start: position,
      position,
      last: { point, at: event.timeStamp },
      velocity: { x: 0, y: 0 },
      moved: false,
    });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = pinch.current;
    if (active?.pointers.has(event.pointerId))
      active.pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (active && active.pointers.size > 1) return;
    const point = { x: event.clientX, y: event.clientY };
    const elapsed = Math.max(1, event.timeStamp - drag.last.at);
    const next = clampPosition(
      {
        x: drag.start.x + point.x - drag.origin.x,
        y: drag.start.y + point.y - drag.origin.y,
      },
      container,
      card,
      insets
    );
    setDrag({
      ...drag,
      position: next,
      moved: drag.moved || distance(point, drag.origin) > 3,
      velocity: {
        x: (point.x - drag.last.point.x) / elapsed,
        y: (point.y - drag.last.point.y) / elapsed,
      },
      last: { point, at: event.timeStamp },
    });
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = pinch.current;
    if (active && active.pointers.size === 2 && active.startDistance > 0) {
      const [a, b] = [...active.pointers.values()];
      const scale = a && b ? distance(a, b) / active.startDistance : 1;
      const size = pinchSize(prefs.size, scale);
      if (size !== prefs.size) update({ size });
    }
    active?.pointers.delete(event.pointerId);
    if (active && active.pointers.size === 0) pinch.current = null;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      const landing = projectedPosition(drag.position, drag.velocity);
      update({ corner: nearestCorner(landing, card, container) });
    }
    setDrag(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const corner = moveCorner(prefs.corner, event.key);
    if (corner !== prefs.corner) {
      event.preventDefault();
      update({ corner });
    }
  };

  const transform = `translate3d(${Math.round(position.x)}px, ${Math.round(position.y)}px, 0)`;
  const measured = container.width > 0 && container.height > 0;
  const pillSide = prefs.corner.endsWith('left') ? 'left' : 'right';
  const pillStyle: CSSProperties = {
    [pillSide]: insets[pillSide] - PIP_MARGIN,
    [prefs.corner.startsWith('top') ? 'top' : 'bottom']:
      prefs.corner.startsWith('top') ? insets.top : insets.bottom,
  };
  return (
    <div
      ref={overlayRef}
      className={cn('pointer-events-none absolute inset-0 z-30', className)}
      data-testid="self-preview-overlay"
    >
      <div
        ref={probeRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute h-0 w-0"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
        }}
      />
      {prefs.hidden ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={t('self_preview_show')}
              data-testid="self-preview-restore"
              className={cn(
                'pointer-events-auto absolute h-11 w-9 border bg-background/90 shadow-md backdrop-blur hover:bg-background',
                pillSide === 'left'
                  ? 'rounded-l-none rounded-r-xl'
                  : 'rounded-r-none rounded-l-xl'
              )}
              style={pillStyle}
              onClick={() => update({ hidden: false })}
            >
              <VideoOff className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={pillSide === 'left' ? 'right' : 'left'}>
            {t('self_preview_show')}
          </TooltipContent>
        </Tooltip>
      ) : (
        <div
          ref={cardRef}
          role="group"
          tabIndex={0}
          aria-label={label}
          aria-roledescription={t('self_preview_role')}
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
          data-testid="self-preview-card"
          data-corner={prefs.corner}
          data-size={prefs.size}
          data-dragging={drag ? 'true' : undefined}
          className={cn(
            'group/pip pointer-events-auto absolute top-0 left-0 isolate touch-none select-none overflow-hidden rounded-2xl bg-background shadow-xl ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            drag
              ? 'cursor-grabbing shadow-2xl'
              : 'cursor-grab motion-safe:transition-[transform,width,height] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.2,0.9,0.3,1.08)]',
            !measured && 'invisible'
          )}
          style={{ width: card.width, height: card.height, transform }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onKeyDown={onKeyDown}
        >
          <div className="absolute inset-0 [&>*]:h-full [&>*]:w-full">
            {children}
          </div>
          <div className="absolute top-2 right-2 z-10 flex gap-1 rounded-lg bg-background/80 p-1 opacity-100 backdrop-blur transition-opacity sm:opacity-0 sm:group-focus-within/pip:opacity-100 sm:group-hover/pip:opacity-100 [@media(hover:none)]:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={t('self_preview_resize', {
                    size: t(`self_preview_size_${nextSize(prefs.size)}`),
                  })}
                  data-testid="self-preview-resize"
                  onClick={() => update({ size: nextSize(prefs.size) })}
                >
                  {prefs.size === 'l' ? (
                    <Shrink className="size-3.5" />
                  ) : (
                    <Expand className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t('self_preview_resize', {
                  size: t(`self_preview_size_${nextSize(prefs.size)}`),
                })}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={t('self_preview_hide')}
                  data-testid="self-preview-hide"
                  onClick={() => update({ hidden: true })}
                >
                  <Video className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('self_preview_hide')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );
}
