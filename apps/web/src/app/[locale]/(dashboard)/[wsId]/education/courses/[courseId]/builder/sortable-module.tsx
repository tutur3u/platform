'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from '@tuturuuu/icons';
import type { WorkspaceCourseBuilderModule } from '@tuturuuu/types/db';
import { cn } from '@tuturuuu/utils/format';

interface SortableModuleProps {
  module: WorkspaceCourseBuilderModule;
  isActive: boolean;
  onClick: () => void;
}

export function SortableModule({
  module,
  isActive,
  onClick,
}: SortableModuleProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: module.id,
    data: { type: 'module', module },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
        isActive
          ? 'border-dynamic-blue/30 bg-dynamic-blue/10'
          : 'border-border/70 hover:bg-foreground/5',
        isDragging && 'z-10 opacity-80 shadow-md'
      )}
    >
      <div className="min-w-0">
        <div className="line-clamp-1 font-medium text-sm">{module.name}</div>
      </div>
      <div
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab text-foreground/40 hover:text-foreground/70 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </div>
    </button>
  );
}
