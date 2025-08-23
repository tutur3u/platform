import { type RefObject, useCallback, useState } from 'react';
import { CHART_CONFIG } from '../constants';

interface UseViewportProps {
  containerRef: RefObject<HTMLDivElement | null>;
  contentBounds: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
}

interface UseViewportReturn {
  scale: number;
  offsetX: number;
  offsetY: number;
  isPanning: boolean;

  // Event handlers
  handleWheel: (event: React.WheelEvent<HTMLCanvasElement>) => void;
  handleMouseDown: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  handleMouseMove: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  handleMouseUp: () => void;
  handleTouchStart: (event: React.TouchEvent<HTMLCanvasElement>) => void;
  handleTouchMove: (event: React.TouchEvent<HTMLCanvasElement>) => void;
  handleTouchEnd: (event: React.TouchEvent<HTMLCanvasElement>) => void;

  // Actions
  zoom: (factor: number) => void;
  centerAndFit: () => void;

  // Utilities
  screenToWorld: (
    screenX: number,
    screenY: number
  ) => { worldX: number; worldY: number };
}

/**
 * Custom hook for managing canvas viewport interactions
 * Handles panning, zooming, and coordinate transformations
 */
export function useViewport({
  containerRef,
  contentBounds,
}: UseViewportProps): UseViewportReturn {
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [pinchDistance, setPinchDistance] = useState<number | null>(null);

  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      return {
        worldX: (screenX - offsetX) / scale,
        worldY: (screenY - offsetY) / scale,
      };
    },
    [scale, offsetX, offsetY]
  );

  const centerAndFit = useCallback(() => {
    if (
      !containerRef.current ||
      contentBounds.width === 0 ||
      contentBounds.height === 0
    ) {
      return;
    }

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // Calculate scale to fit content with padding
    const padding = 100;
    const scaleX = containerWidth / (contentBounds.width + padding);
    const scaleY = containerHeight / (contentBounds.height + padding);
    const newScale = Math.min(scaleX, scaleY, 1);

    // Center the content
    const newOffsetX =
      (containerWidth - contentBounds.width * newScale) / 2 -
      contentBounds.minX * newScale;
    const newOffsetY =
      (containerHeight - contentBounds.height * newScale) / 2 -
      contentBounds.minY * newScale;

    setScale(newScale);
    setOffsetX(newOffsetX);
    setOffsetY(newOffsetY);
  }, [containerRef, contentBounds]);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      // Trackpad two-finger scroll should PAN; pinch-zoom gesture should ZOOM
      if (event.ctrlKey || event.metaKey) {
        // Only prevent default when handling zoom ourselves to avoid page zoom
        event.preventDefault();
        // Zoom gesture
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const { worldX, worldY } = screenToWorld(mouseX, mouseY);
        const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
        const newScale = Math.max(
          CHART_CONFIG.MIN_SCALE,
          Math.min(CHART_CONFIG.MAX_SCALE, scale * zoomFactor)
        );
        setScale(newScale);
        setOffsetX(mouseX - worldX * newScale);
        setOffsetY(mouseY - worldY * newScale);
      } else {
        // Two-finger scroll pan; prevent default to avoid page scrolling while interacting with the canvas
        event.preventDefault();
        setOffsetX((prev) => prev - event.deltaX);
        setOffsetY((prev) => prev - event.deltaY);
      }
    },
    [scale, screenToWorld, containerRef]
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      setIsPanning(true);
      setPanStart({ x: event.clientX, y: event.clientY });
    },
    []
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isPanning) return;

      const dx = event.clientX - panStart.x;
      const dy = event.clientY - panStart.y;

      setOffsetX((prev) => prev + dx);
      setOffsetY((prev) => prev + dy);
      setPanStart({ x: event.clientX, y: event.clientY });
    },
    [isPanning, panStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Touch helpers
  const getTouchDistance = useCallback((t1: Touch, t2: Touch) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
  }, []);

  const getTouchCenter = useCallback((t1: Touch, t2: Touch) => {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };
  }, []);

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      if (event.touches.length === 1) {
        const t = event.touches[0];
        setIsPanning(true);
        setPanStart({ x: t.clientX, y: t.clientY });
      } else if (event.touches.length >= 2) {
        const d = getTouchDistance(event.touches[0], event.touches[1]);
        setPinchDistance(d);
      }
    },
    [getTouchDistance]
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      if (!containerRef.current) return;

      if (event.touches.length >= 2) {
        // Pinch zoom (and allow translate by following center)
        const t1 = event.touches[0];
        const t2 = event.touches[1];
        const newDistance = getTouchDistance(t1, t2);
        const center = getTouchCenter(t1, t2);

        const rect = containerRef.current.getBoundingClientRect();
        const centerX = center.x - rect.left;
        const centerY = center.y - rect.top;
        const { worldX, worldY } = screenToWorld(centerX, centerY);

        const distanceRatio = pinchDistance ? newDistance / pinchDistance : 1;
        const proposedScale = scale * distanceRatio;
        const newScale = Math.max(
          CHART_CONFIG.MIN_SCALE,
          Math.min(CHART_CONFIG.MAX_SCALE, proposedScale)
        );

        setScale(newScale);
        setOffsetX(centerX - worldX * newScale);
        setOffsetY(centerY - worldY * newScale);
        setPinchDistance(newDistance);
      } else if (event.touches.length === 1 && isPanning) {
        // Single-finger pan
        const t = event.touches[0];
        const dx = t.clientX - panStart.x;
        const dy = t.clientY - panStart.y;
        setOffsetX((prev) => prev + dx);
        setOffsetY((prev) => prev + dy);
        setPanStart({ x: t.clientX, y: t.clientY });
      }
    },
    [
      containerRef,
      getTouchCenter,
      getTouchDistance,
      isPanning,
      panStart,
      pinchDistance,
      scale,
      screenToWorld,
    ]
  );

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      if (event.touches.length === 0) {
        setIsPanning(false);
        setPinchDistance(null);
      }
      if (event.touches.length < 2) {
        setPinchDistance(null);
      }
    },
    []
  );

  const zoom = useCallback(
    (factor: number) => {
      const newScale = Math.max(
        CHART_CONFIG.MIN_SCALE,
        Math.min(CHART_CONFIG.MAX_SCALE, scale * factor)
      );
      setScale(newScale);
    },
    [scale]
  );

  return {
    scale,
    offsetX,
    offsetY,
    isPanning,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    zoom,
    centerAndFit,
    screenToWorld,
  };
}
