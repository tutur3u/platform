'use client';

import { MousePointer2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import {
  type CursorPosition,
  useCursorTracking,
} from '@tuturuuu/ui/hooks/useCursorTracking';
import { useEffect, useState } from 'react';

interface CursorOverlayProps {
  cursors: Map<string, CursorPosition>;
  currentUserId?: string;
  width?: number;
  height?: number;
}

export default function CursorOverlay({
  cursors,
  width,
  height,
}: CursorOverlayProps) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-50"
      style={{
        width: width ? `${width}px` : undefined,
        height: height ? `${height}px` : undefined,
      }}
    >
      {Array.from(cursors.entries()).map(([userId, cursor]) => {
        const { x, y, user } = cursor;

        // Don't render if cursor is outside the visible area
        if (x < 0 || y < 0) return null;

        return (
          <div
            key={userId}
            className="pointer-events-none absolute z-50"
            style={{
              transform: `translate(${x}px, ${y}px)`,
            }}
          >
            {/* Triangle cursor indicator */}
            <div className="absolute z-10">
              <MousePointer2 className="size-5 text-foreground" />
            </div>

            {/* Badge */}
            <Badge className="absolute top-4 left-4 border-2 border-background bg-background ring-1 ring-border transition-shadow hover:ring-2">
              <p className="font-medium text-foreground text-xs">
                {user?.display_name || 'Unknown User'}
              </p>
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

export function CursorOverlayWrapper({
  channelName,
  containerRef,
}: {
  channelName: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [overlaySize, setOverlaySize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });
  const { cursors, error } = useCursorTracking(channelName, containerRef);

  useEffect(() => {
    if (!containerRef.current) return;

    try {
      const updateOverlaySize = () => {
        try {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            setOverlaySize({ width: rect.width, height: rect.height });
          }
        } catch (err) {
          // Silently fail on resize errors
          console.warn('Cursor overlay resize error:', err);
        }
      };

      // Initial update
      updateOverlaySize();

      // Update on resize
      const resizeObserver = new ResizeObserver(updateOverlaySize);
      resizeObserver.observe(containerRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    } catch (err) {
      // Catch any setup errors
      console.warn('Cursor overlay setup error:', err);
      return;
    }
  }, [containerRef]);

  // Don't render if errors detected
  if (error) {
    return null;
  }

  return (
    <CursorOverlay
      cursors={cursors}
      width={overlaySize.width}
      height={overlaySize.height}
    />
  );
}
