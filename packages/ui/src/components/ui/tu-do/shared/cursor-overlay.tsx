'use client';

import type { CursorPosition } from '@tuturuuu/ui/hooks/useCursorTracking';
import CollaboratorCursor from './collaborator-cursor';

interface CursorOverlayProps {
  cursors: Map<string, CursorPosition>;
  currentUserId?: string;
  width?: number;
}

export default function CursorOverlay({
  cursors,
  currentUserId,
  width = 0,
}: CursorOverlayProps) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-50"
      style={{
        width: `${width}px`,
      }}
    >
      {Array.from(cursors.entries()).map(([userId, cursor]) => {
        // Don't render the current user's cursor
        if (userId === currentUserId) return null;

        return (
          <CollaboratorCursor
            key={userId}
            user={cursor.user}
            x={cursor.x}
            y={cursor.y}
          />
        );
      })}
    </div>
  );
}
