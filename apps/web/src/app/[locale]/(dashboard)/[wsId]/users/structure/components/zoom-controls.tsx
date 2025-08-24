import { Button } from '@tuturuuu/ui/button';
import { RotateCcw, ZoomIn, ZoomOut } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import React from 'react';

interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  className?: string;
}

/**
 * Zoom controls component for the organizational chart
 * Provides zoom in, zoom out, and reset view functionality
 */
export const ZoomControls = React.memo<ZoomControlsProps>(
  ({ onZoomIn, onZoomOut, onReset, className = '' }) => {
    const t = useTranslations('organizational_structure');

    return (
      <div
        className={`flex flex-col gap-1 rounded-lg border border-border bg-background/95 p-2 shadow-lg backdrop-blur-sm transition-all duration-200 hover:shadow-xl ${className}`}
      >
        <Button
          size="sm"
          variant="outline"
          onClick={onZoomIn}
          title={t('zoom_in')}
          className="h-10 w-10 p-0 transition-all duration-150 hover:scale-105 hover:bg-accent/50"
          aria-label={t('zoom_in')}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onZoomOut}
          title={t('zoom_out')}
          className="h-10 w-10 p-0 transition-all duration-150 hover:scale-105 hover:bg-accent/50"
          aria-label={t('zoom_out')}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onReset}
          title={t('reset_view')}
          className="h-10 w-10 p-0 transition-all duration-150 hover:scale-105 hover:bg-accent/50"
          aria-label={t('reset_view')}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    );
  }
);

ZoomControls.displayName = 'ZoomControls';
