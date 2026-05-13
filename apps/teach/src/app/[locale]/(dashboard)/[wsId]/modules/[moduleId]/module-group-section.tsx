'use client';

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useState } from 'react';
import { AddModuleRow } from './add-module-row';
import { ModuleItemRow } from './module-item-row';
import type { ModuleGroupWithModules } from './use-module-detail';

interface ModuleGroupSectionProps {
  group: ModuleGroupWithModules;
  wsId: string;
  courseId: string;
  onAddModule: (moduleGroupId: string, name: string) => void;
  onDeleteGroup: (moduleGroupId: string) => void;
  onRenameGroup: (moduleGroupId: string, title: string) => void;
  onRenameModule: (moduleId: string, name: string) => void;
  onDeleteModule: (moduleId: string) => void;
  onTogglePublished: (moduleId: string, is_published: boolean) => void;
  isAddingModule: boolean;
  isDeletingGroup: boolean;
}

export function ModuleGroupSection({
  group,
  wsId,
  courseId,
  onAddModule,
  onDeleteGroup,
  onRenameGroup,
  onRenameModule,
  onDeleteModule,
  onTogglePublished,
  isAddingModule,
  isDeletingGroup,
}: ModuleGroupSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(group.title);
  const [addingModule, setAddingModule] = useState(false);
  const titleInputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  // Drag handle for the group itself
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  useEffect(() => {
    if (!editingTitle) setTitleDraft(group.title);
  }, [editingTitle, group.title]);

  function commitTitle() {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== group.title) {
      onRenameGroup(group.id, trimmed);
    } else {
      setTitleDraft(group.title);
    }
    setEditingTitle(false);
  }

  const moduleIds = group.modules.map((m) => m.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'border-2 border-border bg-background shadow-[5px_5px_0_var(--border)] transition-shadow',
        isDragging && 'opacity-50 shadow-none'
      )}
    >
      {/* Section header */}
      <div className="flex items-center gap-2 border-border border-b-2 bg-muted/40 px-3 py-2.5">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          type="button"
          aria-label="Drag to reorder section"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Collapse toggle */}
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setCollapsed((v) => !v)}
          type="button"
          aria-label={collapsed ? 'Expand section' : 'Collapse section'}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {/* Section icon */}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-border bg-dynamic-cyan/15">
          <BookOpen className="h-3.5 w-3.5" />
        </span>

        {/* Title — inline edit */}
        {editingTitle ? (
          <input
            ref={titleInputRef}
            className="min-w-0 flex-1 border-primary border-b-2 bg-transparent font-bold text-sm outline-none"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle();
              if (e.key === 'Escape') {
                setTitleDraft(group.title);
                setEditingTitle(false);
              }
            }}
          />
        ) : (
          <button
            className="min-w-0 flex-1 truncate text-left font-bold text-sm hover:text-primary"
            onClick={() => {
              setTitleDraft(group.title);
              setEditingTitle(true);
            }}
            type="button"
          >
            {group.title}
          </button>
        )}

        {/* Module count badge */}
        <span className="shrink-0 border border-border bg-card px-1.5 py-0.5 font-bold text-muted-foreground text-xs tabular-nums">
          {group.modules.length}
        </span>

        {/* Add module */}
        <button
          className="shrink-0 text-muted-foreground hover:text-primary disabled:opacity-40"
          disabled={isAddingModule}
          onClick={() => {
            setCollapsed(false);
            setAddingModule(true);
          }}
          type="button"
          aria-label="Add module to section"
        >
          <Plus className="h-4 w-4" />
        </button>

        {/* Delete group */}
        <button
          className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-40"
          disabled={isDeletingGroup}
          onClick={() => onDeleteGroup(group.id)}
          type="button"
          aria-label="Delete section"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Module rows */}
      {!collapsed && (
        <div>
          <SortableContext
            items={moduleIds}
            strategy={verticalListSortingStrategy}
          >
            {group.modules.map((mod, index) => (
              <ModuleItemRow
                key={mod.id}
                module={mod}
                index={index}
                wsId={wsId}
                courseId={courseId}
                onRename={(name) => onRenameModule(mod.id, name)}
                onDelete={() => onDeleteModule(mod.id)}
                onTogglePublished={(val) => onTogglePublished(mod.id, val)}
              />
            ))}
          </SortableContext>

          {/* Inline add-module row */}
          {addingModule ? (
            <AddModuleRow
              isAdding={isAddingModule}
              onAdd={(name) => {
                onAddModule(group.id, name);
                setAddingModule(false);
              }}
              onCancel={() => setAddingModule(false)}
            />
          ) : (
            <button
              className="flex w-full items-center gap-2 px-4 py-2 text-muted-foreground text-sm hover:bg-muted/40 hover:text-foreground"
              onClick={() => setAddingModule(true)}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
              Add module
            </button>
          )}
        </div>
      )}
    </div>
  );
}
