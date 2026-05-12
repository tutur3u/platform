'use client';

import { useSortable } from '@dnd-kit/sortable';
import Link from 'next/link';
import { CSS } from '@dnd-kit/utilities';
import {
  Eye,
  EyeOff,
  GripVertical,
  Pencil,
  Trash2,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import type { WorkspaceCourseModule } from '@tuturuuu/types/db';

interface ModuleItemRowProps {
  module: WorkspaceCourseModule;
  index: number;
  wsId: string;
  courseId: string;
  onRename: (name: string) => void;
  onDelete: () => void;
  onTogglePublished: (is_published: boolean) => void;
}

export function ModuleItemRow({
  module,
  index,
  wsId,
  courseId,
  onRename,
  onDelete,
  onTogglePublished,
}: ModuleItemRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(module.name ?? '');

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: module.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== module.name) {
      onRename(trimmed);
    } else {
      setDraft(module.name ?? '');
    }
    setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group/row flex items-center gap-2 border-border border-t px-4 py-2.5 transition-colors hover:bg-muted/30',
        isDragging && 'opacity-50'
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 active:cursor-grabbing"
        type="button"
        aria-label="Drag to reorder module"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Index badge */}
      <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-border bg-muted font-bold text-[10px] tabular-nums">
        {index + 1}
      </span>

      {/* Name — inline edit */}
      {editing ? (
        <input
          autoFocus
          className="min-w-0 flex-1 border-b-2 border-primary bg-transparent text-sm outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
              setDraft(module.name ?? '');
              setEditing(false);
            }
          }}
        />
      ) : (
        <Link
          className="min-w-0 flex-1 truncate text-sm hover:text-primary hover:underline"
          href={`/${wsId}/modules/${courseId}/${module.id}`}
        >
          {module.name ?? 'Untitled'}
        </Link>
      )}



      {/* Published toggle */}
      <button
        className={cn(
          'shrink-0 border border-border px-1.5 py-0.5 font-bold text-[10px] transition',
          module.is_published
            ? 'bg-dynamic-green/15 text-foreground'
            : 'bg-muted text-muted-foreground'
        )}
        onClick={() => onTogglePublished(!module.is_published)}
        type="button"
        aria-label={module.is_published ? 'Unpublish module' : 'Publish module'}
      >
        {module.is_published ? (
          <Eye className="h-3 w-3" />
        ) : (
          <EyeOff className="h-3 w-3" />
        )}
      </button>

      {/* Rename */}
      <button
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 hover:text-foreground"
        onClick={() => setEditing(true)}
        type="button"
        aria-label="Rename module"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      {/* Delete */}
      <button
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 hover:text-destructive"
        onClick={onDelete}
        type="button"
        aria-label="Delete module"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
