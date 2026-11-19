'use client';

import { ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import {
  type PointerEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Button } from '../button';
import { Skeleton } from '../skeleton';
import type { MediaPreviewItem } from './media-preview-dialog';

const SWIPE_DISTANCE = 48;

/** The width an image has when it just fits the stage, times `zoom`. */
function useFittedWidth(
  stage: React.RefObject<HTMLDivElement | null>,
  aspect: number
) {
  const [fit, setFit] = useState(0);
  useLayoutEffect(() => {
    const node = stage.current;
    if (!node) return;
    const measure = () =>
      setFit(Math.min(node.clientWidth, node.clientHeight * aspect));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [stage, aspect]);
  return fit;
}

/**
 * The image area of a media preview: the image fits the stage, zooms by
 * scaling that fitted size, scrolls and drags when zoomed, and swipes to the
 * neighbouring item when not. Edge buttons mirror the arrow keys.
 */
export function MediaPreviewStage({
  item,
  zoom,
  onZoomChange,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  children,
}: {
  item: MediaPreviewItem;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
  /** Controls drawn over the stage. */
  children?: React.ReactNode;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; left: number; top: number }>(
    null
  );
  const [loaded, setLoaded] = useState(false);
  const fit = useFittedWidth(stage, item.width / item.height);
  const width = fit * zoom;
  const zoomed = zoom > 1;

  const recenter = useCallback(() => {
    const node = stage.current;
    if (!node) return;
    node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2;
    node.scrollTop = (node.scrollHeight - node.clientHeight) / 2;
  }, []);
  useLayoutEffect(recenter, [recenter, width, zoomed]);

  const down = (event: PointerEvent<HTMLDivElement>) => {
    const node = stage.current;
    if (!node || event.button !== 0) return;
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      left: node.scrollLeft,
      top: node.scrollTop,
    };
    if (zoomed && event.pointerType === 'mouse')
      node.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    const node = stage.current;
    if (!start || !node || !zoomed || event.pointerType !== 'mouse') return;
    node.scrollLeft = start.left - (event.clientX - start.x);
    node.scrollTop = start.top - (event.clientY - start.y);
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    gesture.current = null;
    if (!start || zoomed) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5)
      return;
    if (dx < 0 && canNext) onNext();
    if (dx > 0 && canPrevious) onPrevious();
  };

  return (
    <div className="relative min-h-0 bg-muted/40">
      <div
        ref={stage}
        data-zoomed={zoomed || undefined}
        className="absolute inset-0 flex touch-pan-y overflow-auto data-zoomed:cursor-grab data-zoomed:touch-auto"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          gesture.current = null;
        }}
        onDoubleClick={() => onZoomChange(zoomed ? 1 : 2)}
      >
        {!loaded && (
          <Skeleton
            className="absolute inset-4 m-auto rounded-xl"
            style={{ aspectRatio: item.width / item.height, maxHeight: '90%' }}
          />
        )}
        <img
          key={item.src}
          src={item.src}
          alt={item.alt}
          width={item.width}
          height={item.height}
          draggable={false}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className="m-auto max-w-none select-none rounded-lg object-contain shadow-sm"
          style={{
            width: width || undefined,
            maxWidth: width ? undefined : '100%',
            maxHeight: zoomed ? undefined : '100%',
            opacity: loaded ? 1 : 0,
          }}
        />
      </div>
      {[
        {
          side: 'left-2',
          enabled: canPrevious,
          run: onPrevious,
          label: previousLabel,
          Icon: ChevronLeft,
        },
        {
          side: 'right-2',
          enabled: canNext,
          run: onNext,
          label: nextLabel,
          Icon: ChevronRight,
        },
      ].map(({ side, enabled, run, label, Icon }) => (
        <Button
          key={side}
          type="button"
          size="icon"
          variant="secondary"
          disabled={!enabled}
          aria-label={label}
          onClick={run}
          className={`absolute top-1/2 ${side} -translate-y-1/2 size-11 rounded-full shadow-sm`}
        >
          <Icon aria-hidden />
        </Button>
      ))}
      {children}
    </div>
  );
}
