'use client';

import React, { useEffect, useRef } from 'react';
import type { OrganizationalData } from '../types';
import {
  useCanvasRenderer,
  useImagePreloader,
  useNodeInteractions,
  useOrgLayout,
  useViewport,
} from './hooks';
import { LoadingOverlay } from './loading-overlay';
import { ZoomControls } from './zoom-controls';

interface OrgChartCanvasProps {
  data: OrganizationalData;
  onEmployeeSelect: (employmentId: string) => void;
  selectedEmployeeId?: string;
}

export const OrgChartCanvas = React.memo<OrgChartCanvasProps>(
  ({ data, onEmployeeSelect, selectedEmployeeId }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Custom hooks for separated concerns
    const {
      images,
      loading: imagesLoading,
      errors: imageErrors,
    } = useImagePreloader(data.people);
    const { nodes, departmentLayouts, contentBounds } = useOrgLayout(data);

    const {
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
    } = useViewport({
      containerRef,
      contentBounds,
    });

    const { handleCanvasClick } = useNodeInteractions({
      canvasRef,
      nodes,
      onEmployeeSelect,
      screenToWorld,
    });

    useCanvasRenderer({
      canvasRef,
      data,
      nodes,
      departmentLayouts,
      images,
      scale,
      offsetX,
      offsetY,
      selectedEmployeeId,
    });

    // Auto-center when layout changes
    useEffect(() => {
      if (Object.keys(departmentLayouts).length > 0) {
        centerAndFit();
      }
    }, [departmentLayouts, centerAndFit]);

    // Prevent browser zoom/scroll gestures while interacting inside the container
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const onWheel = (e: WheelEvent) => {
        // Stop page scroll/zoom when interacting with chart
        e.preventDefault();
      };
      const onGesture = (e: Event) => {
        // Safari pinch gesture events
        e.preventDefault();
      };
      const onTouchMove = (e: TouchEvent) => {
        // Prevent native touch scrolling/zooming inside container
        e.preventDefault();
      };

      el.addEventListener('wheel', onWheel, { passive: false });
      // @ts-expect-error: gesture events are Safari-specific
      el.addEventListener('gesturestart', onGesture, { passive: false });
      // @ts-expect-error: gesture events are Safari-specific
      el.addEventListener('gesturechange', onGesture, { passive: false });
      el.addEventListener('touchmove', onTouchMove, { passive: false });

      return () => {
        el.removeEventListener('wheel', onWheel as EventListener);
        // @ts-expect-error Safari-specific
        el.removeEventListener('gesturestart', onGesture as EventListener);
        // @ts-expect-error Safari-specific
        el.removeEventListener('gesturechange', onGesture as EventListener);
        el.removeEventListener('touchmove', onTouchMove as EventListener);
      };
    }, []);

    // Zoom controls handlers
    const handleZoomIn = () => zoom(1.2);
    const handleZoomOut = () => zoom(0.8);

    return (
      <div
        ref={containerRef}
        className="relative h-screen w-full select-none overflow-hidden overscroll-none border shadow-sm"
        style={{ cursor: isPanning ? 'grabbing' : 'grab', touchAction: 'none' }}
      >
        <LoadingOverlay isVisible={imagesLoading} />

        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          onClick={handleCanvasClick}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          tabIndex={0}
          role="img"
          aria-label="Interactive organizational chart"
        />

        <ZoomControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={centerAndFit}
          className="absolute right-4 bottom-4"
        />

        {/* Show error message if there are image loading errors */}
        {Object.keys(imageErrors).length > 0 && (
          <div className="absolute top-4 left-4 max-w-xs rounded-md border border-dynamic-red/30 bg-dynamic-red/10 p-2">
            <p className="text-dynamic-red text-sm">
              {Object.keys(imageErrors).length} profile image(s) failed to load
            </p>
          </div>
        )}
      </div>
    );
  }
);

OrgChartCanvas.displayName = 'OrgChartCanvas';
