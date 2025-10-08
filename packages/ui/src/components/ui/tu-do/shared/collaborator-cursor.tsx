import type { User as UserType } from '@tuturuuu/types/primitives/User';
import { Badge } from '@tuturuuu/ui/badge';
import { MousePointer2 } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';

interface CollaboratorCursorProps {
  user: UserType;
  x: number;
  y: number;
}

export default function CollaboratorCursor({
  user,
  x,
  y,
}: CollaboratorCursorProps) {
  // Don't render if cursor is outside the visible area
  if (x < 0 || y < 0) return null;

  return (
    <div
      className="pointer-events-none absolute z-50 transition-transform duration-100 ease-out hover:scale-110"
      style={{
        transform: `translate(${x}px, ${y}px)`,
      }}
    >
      {/* Triangle cursor indicator */}
      <div className="absolute z-10">
        <MousePointer2 className="size-5 text-foreground" />
      </div>

      {/* Badge */}
      <Badge
        className={cn(
          'absolute top-4 left-4 border-2 border-background bg-background ring-1 ring-border transition-shadow hover:ring-2'
        )}
      >
        <p className="font-medium text-foreground text-xs">
          {user.display_name || 'Unknown User'}
        </p>
      </Badge>
    </div>
  );
}
