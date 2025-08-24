import React from 'react';

interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
}

/**
 * Loading overlay component for the organizational chart
 * Shows a loading spinner and message while images are preloading
 */
export const LoadingOverlay = React.memo<LoadingOverlayProps>(
  ({ isVisible }) => {
    if (!isVisible) return null;

    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/90 backdrop-blur-sm transition-opacity duration-300">
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card/90 p-6 shadow-lg">
          {/* Loading spinner */}
          <div className="relative">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            <div className="absolute inset-0 h-8 w-8 animate-ping rounded-full bg-primary/20" />
          </div>
        </div>
      </div>
    );
  }
);

LoadingOverlay.displayName = 'LoadingOverlay';
