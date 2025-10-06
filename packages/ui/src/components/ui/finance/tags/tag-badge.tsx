'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { X } from 'lucide-react';

interface TagBadgeProps {
  name: string;
  color: string;
  onRemove?: () => void;
  className?: string;
}

export function TagBadge({ name, color, onRemove, className }: TagBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={className}
      style={{
        borderColor: color,
        color: color,
        backgroundColor: `${color}15`,
      }}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 rounded-full hover:bg-black/10"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge>
  );
}
