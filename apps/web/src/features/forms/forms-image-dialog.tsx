'use client';

import { Download, X, ZoomIn, ZoomOut } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@tuturuuu/ui/dialog';
import { Slider } from '@tuturuuu/ui/slider';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const MINIMAP_SIZE = 120;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function FormsImageDialog({
  open,
  onOpenChange,
  src,
  alt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  alt: string;
}) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, translateX: 0, translateY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (open) {
      resetView();
    }
  }, [open, resetView]);

  const scaleRef = useRef(scale);
  const translateRef = useRef(translate);
  scaleRef.current = scale;
  translateRef.current = translate;

  useEffect(() => {
    if (!open) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const s = scaleRef.current;
      const t = translateRef.current;

      // Improved zoom sensitivity and feel
      const zoomFactor = 1.1 ** (-e.deltaY / 100);
      const newScale = clamp(s * zoomFactor, MIN_ZOOM, MAX_ZOOM);

      if (newScale === s) return;

      let newTranslateX: number;
      let newTranslateY: number;

      if (newScale <= 1) {
        newTranslateX = 0;
        newTranslateY = 0;
      } else {
        // Calculate cursor position relative to the viewport center
        const cursorX = e.clientX - window.innerWidth / 2;
        const cursorY = e.clientY - window.innerHeight / 2;

        // Maintain cursor position relative to image
        const imgX = (cursorX - t.x) / s;
        const imgY = (cursorY - t.y) / s;
        newTranslateX = cursorX - imgX * newScale;
        newTranslateY = cursorY - imgY * newScale;
      }

      setScale(newScale);
      setTranslate({ x: newTranslateX, y: newTranslateY });
    };

    window.addEventListener('wheel', onWheel, {
      passive: false,
      capture: true,
    });
    return () =>
      window.removeEventListener('wheel', onWheel, { capture: true });
  }, [open]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        translateX: translate.x,
        translateY: translate.y,
      };
    },
    [translate]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;

      // Only allow dragging when zoomed in or with manual override
      const nextX =
        dragStart.current.translateX + (e.clientX - dragStart.current.x);
      const nextY =
        dragStart.current.translateY + (e.clientY - dragStart.current.y);

      setTranslate({ x: nextX, y: nextY });
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);

    // Snapping back if scale is 1
    if (scale <= 1) {
      setTranslate({ x: 0, y: 0 });
    }
  }, [scale]);

  const handleDoubleClick = useCallback(() => {
    if (scale > 1) {
      resetView();
    } else {
      setScale(2);
      setTranslate({ x: 0, y: 0 });
    }
  }, [scale, resetView]);

  const handleSliderChange = useCallback((value: number[]) => {
    const v = value[0];
    if (v == null) return;
    const linear = v / 100;
    const newScale = MIN_ZOOM + linear * (MAX_ZOOM - MIN_ZOOM);
    setScale(newScale);
    if (newScale <= 1) setTranslate({ x: 0, y: 0 });
  }, []);

  const sliderValue = Math.round(
    ((scale - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100
  );

  const zoomIn = useCallback(() => {
    setScale((s) => clamp(s + ZOOM_STEP * 2, MIN_ZOOM, MAX_ZOOM));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((s) => {
      const next = clamp(s - ZOOM_STEP * 2, MIN_ZOOM, MAX_ZOOM);
      if (next <= 1) setTranslate({ x: 0, y: 0 });
      return next;
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="fixed inset-0 z-50 flex h-screen max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col rounded-none border-none bg-background/40 p-0 shadow-none backdrop-blur-2xl transition-all duration-300 sm:max-w-none"
      >
        <DialogTitle className="sr-only">{alt}</DialogTitle>

        <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-10 w-10 rounded-full border border-border/40 bg-background/60 shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:bg-background/80 active:scale-95"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div
          ref={containerRef}
          className="absolute inset-0 flex touch-none flex-col items-center justify-center overflow-hidden"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
        >
          <div
            className="flex items-center justify-center transition-transform duration-200 ease-out will-change-transform"
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'zoom-in',
            }}
          >
            {/* biome-ignore lint/performance/noImgElement: signed URLs are not compatible with Next.js image optimization */}
            <img
              ref={imageRef}
              src={src}
              alt={alt}
              className="max-h-[85vh] max-w-[90vw] select-none rounded-lg object-contain shadow-2xl transition-all duration-500"
              draggable={false}
              style={{
                pointerEvents: 'none',
                filter: isDragging ? 'brightness(0.95)' : 'none',
              }}
            />
          </div>

          <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-background/60 px-5 py-3 shadow-2xl backdrop-blur-md">
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                download={alt}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full',
                  'border border-border/40 bg-background/40 text-foreground shadow-sm transition-all hover:scale-110 hover:bg-background/80'
                )}
                aria-label="Download"
              >
                <Download className="h-4 w-4" />
              </a>

              <div className="h-4 w-px bg-border/40" />

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full hover:bg-background/40"
                  onClick={zoomOut}
                  disabled={scale <= MIN_ZOOM}
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Slider
                  value={[sliderValue]}
                  onValueChange={handleSliderChange}
                  min={0}
                  max={100}
                  step={1}
                  className="w-32 cursor-pointer"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full hover:bg-background/40"
                  onClick={zoomIn}
                  disabled={scale >= MAX_ZOOM}
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>

              <div className="h-4 w-px bg-border/40" />

              <span className="min-w-[3rem] text-center font-medium text-muted-foreground text-sm tabular-nums">
                {Math.round(scale * 100)}%
              </span>
            </div>
          </div>

          {scale > 1.2 && (
            <div className="fade-in zoom-in slide-in-from-right-4 absolute right-6 bottom-6 animate-in overflow-hidden rounded-xl border border-border/40 bg-background/60 shadow-2xl backdrop-blur-md duration-300">
              <div
                className="relative"
                style={{
                  width: MINIMAP_SIZE,
                  height: MINIMAP_SIZE,
                }}
              >
                {/* biome-ignore lint/performance/noImgElement: signed URLs, minimap preview */}
                <img
                  src={src}
                  alt=""
                  className="h-full w-full object-contain opacity-50"
                  style={{
                    width: MINIMAP_SIZE,
                    height: MINIMAP_SIZE,
                    objectFit: 'contain',
                  }}
                />
                <div
                  className="absolute border-2 border-primary bg-primary/10 transition-all duration-100"
                  style={{
                    left: `${50 - 50 / scale + (translate.x / (imageRef.current?.width || 1) / scale) * 100}%`,
                    top: `${50 - 50 / scale + (translate.y / (imageRef.current?.height || 1) / scale) * 100}%`,
                    width: `${(1 / scale) * 100}%`,
                    height: `${(1 / scale) * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
