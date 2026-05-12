'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ArrowLeft, BookOpenCheck, GraduationCap, Plus, Sparkles } from '@tuturuuu/icons';
import Link from 'next/link';
import { useState } from 'react';
import { ModuleGroupSection } from './module-group-section';
import { useModuleDetail, type ModuleGroupWithModules } from './use-module-detail';

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse border-2 border-border bg-card shadow-[5px_5px_0_var(--border)]"
        >
          <div className="h-11 border-border border-b-2 bg-muted/40" />
          <div className="space-y-px p-0">
            {[1, 2].map((j) => (
              <div key={j} className="h-10 border-border border-t bg-muted/20" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="border-2 border-border border-dashed bg-muted/60 p-10 text-center shadow-[8px_8px_0_var(--border)]">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center border-2 border-border bg-background shadow-[4px_4px_0_var(--border)]">
        <Sparkles className="h-7 w-7" />
      </div>
      <p className="mx-auto max-w-sm text-muted-foreground leading-7">
        No sections yet. Add a section to start organizing your modules.
      </p>
      <button
        className="mt-5 inline-flex items-center gap-2 border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
        onClick={onAdd}
        type="button"
      >
        <Plus className="h-4 w-4" />
        Add first section
      </button>
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export function ModuleDetailClient({
  courseId,
  wsId,
  workspaceName,
}: {
  courseId: string;
  wsId: string;
  workspaceName: string | null;
}) {
  const {
    groups,
    isLoading,
    isError,
    createGroup,
    deleteGroup,
    reorderGroups,
    renameGroup,
    createModule,
    deleteModule,
    reorderModules,
    renameModule,
    togglePublished,
  } = useModuleDetail(wsId, courseId);

  // Local optimistic group order for drag
  const [localGroups, setLocalGroups] = useState<ModuleGroupWithModules[] | null>(null);
  const displayGroups = localGroups ?? groups;

  // Active drag item id (for overlay)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeModuleGroupId, setActiveModuleGroupId] = useState<string | null>(null);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // ─── Add section ─────────────────────────────────────────────────────────────

  const [addingSectionName, setAddingSectionName] = useState('');
  const [showAddSection, setShowAddSection] = useState(false);

  function commitAddSection() {
    const trimmed = addingSectionName.trim();
    if (trimmed) {
      createGroup.mutate(trimmed);
      setAddingSectionName('');
      setShowAddSection(false);
    }
  }

  // ─── Drag handlers ────────────────────────────────────────────────────────────

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    // Determine if dragging a group or a module
    const isGroup = displayGroups.some((g) => g.id === id);
    if (isGroup) {
      setActiveGroupId(id);
      setLocalGroups(displayGroups);
    } else {
      // Find which group this module belongs to
      const ownerGroup = displayGroups.find((g) =>
        g.modules.some((m) => m.id === id)
      );
      if (ownerGroup) {
        setActiveModuleGroupId(ownerGroup.id);
        setActiveModuleId(id);
      }
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setActiveGroupId(null);
      setActiveModuleGroupId(null);
      setActiveModuleId(null);
      setLocalGroups(null);
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    // Group reorder
    if (activeGroupId) {
      const oldIndex = displayGroups.findIndex((g) => g.id === activeId);
      const newIndex = displayGroups.findIndex((g) => g.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(displayGroups, oldIndex, newIndex);
        setLocalGroups(reordered);
        reorderGroups.mutate(reordered.map((g) => g.id), {
          onSettled: () => setLocalGroups(null),
        });
      }
    }

    // Module reorder within a group
    if (activeModuleGroupId && activeModuleId) {
      const ownerGroup = displayGroups.find((g) => g.id === activeModuleGroupId);
      if (ownerGroup) {
        const mods = ownerGroup.modules;
        const oldIndex = mods.findIndex((m) => m.id === activeId);
        const newIndex = mods.findIndex((m) => m.id === overId);
        if (oldIndex !== -1 && newIndex !== -1) {
          const reordered = arrayMove(mods, oldIndex, newIndex);
          reorderModules.mutate({
            moduleGroupId: activeModuleGroupId,
            moduleIds: reordered.map((m) => m.id),
          });
        }
      }
    }

    setActiveGroupId(null);
    setActiveModuleGroupId(null);
    setActiveModuleId(null);
    setLocalGroups(null);
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-root-background px-5 py-5 text-foreground md:px-8">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Page header */}
        <div className="border-2 border-border bg-background p-6 shadow-[8px_8px_0_var(--border)] md:p-8">
          <Link
            href={`/${wsId}/modules`}
            className="mb-5 inline-flex items-center gap-2 border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to courses
          </Link>

          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center border-2 border-border bg-dynamic-cyan/15 shadow-[4px_4px_0_var(--border)]">
              <BookOpenCheck className="h-7 w-7" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="mb-2 inline-flex items-center gap-1.5 border-2 border-border bg-dynamic-yellow/15 px-3 py-1 font-black text-xs shadow-[3px_3px_0_var(--border)]">
                <GraduationCap className="h-3.5 w-3.5" />
                {workspaceName ?? 'Workspace'}
              </p>
              <h1 className="font-black text-[clamp(1.75rem,3.5vw,3rem)] leading-none tracking-normal">
                Course Modules
              </h1>
              <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                Drag sections and modules to reorder. Click a name to rename inline.
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="font-black text-xl">
              {displayGroups.length} section{displayGroups.length !== 1 ? 's' : ''}
            </span>
            <span className="ml-2 text-muted-foreground text-sm">
              ·{' '}
              {displayGroups.reduce((s, g) => s + g.modules.length, 0)} modules
            </span>
          </div>

          {showAddSection ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                className="border-2 border-border bg-background px-3 py-1.5 text-sm shadow-[2px_2px_0_var(--border)] outline-none focus:border-primary"
                placeholder="Section name…"
                value={addingSectionName}
                onChange={(e) => setAddingSectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitAddSection();
                  if (e.key === 'Escape') {
                    setAddingSectionName('');
                    setShowAddSection(false);
                  }
                }}
              />
              <button
                className="border-2 border-border bg-primary px-3 py-1.5 font-bold text-primary-foreground text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
                disabled={!addingSectionName.trim() || createGroup.isPending}
                onClick={commitAddSection}
                type="button"
              >
                Add
              </button>
              <button
                className="border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)]"
                onClick={() => {
                  setAddingSectionName('');
                  setShowAddSection(false);
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="inline-flex items-center gap-2 border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
              onClick={() => setShowAddSection(true)}
              type="button"
            >
              <Plus className="h-4 w-4" />
              Add section
            </button>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : isError ? (
          <div className="border-2 border-border border-dashed bg-muted/60 p-8 text-center shadow-[8px_8px_0_var(--border)]">
            <p className="text-muted-foreground">Failed to load modules.</p>
          </div>
        ) : displayGroups.length === 0 ? (
          <EmptyState onAdd={() => setShowAddSection(true)} />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={displayGroups.map((g) => g.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {displayGroups.map((group) => (
                  <ModuleGroupSection
                    key={group.id}
                    group={group}
                    wsId={wsId}
                    courseId={courseId}
                    onAddModule={(moduleGroupId, name) =>
                      createModule.mutate({ moduleGroupId, name })
                    }
                    onDeleteGroup={(id) => deleteGroup.mutate(id)}
                    onRenameGroup={(id, title) =>
                      renameGroup.mutate({ moduleGroupId: id, title })
                    }
                    onRenameModule={(id, name) =>
                      renameModule.mutate({ moduleId: id, name })
                    }
                    onDeleteModule={(id) => deleteModule.mutate(id)}
                    onTogglePublished={(id, val) =>
                      togglePublished.mutate({ moduleId: id, is_published: val })
                    }
                    isAddingModule={createModule.isPending}
                    isDeletingGroup={deleteGroup.isPending}
                  />
                ))}
              </div>
            </SortableContext>

            {/* Drag overlay — ghost while dragging */}
            <DragOverlay>
              {activeGroupId ? (
                <div className="border-2 border-primary bg-background px-4 py-3 font-bold text-sm shadow-[6px_6px_0_var(--border)] opacity-90">
                  {displayGroups.find((g) => g.id === activeGroupId)?.title}
                </div>
              ) : activeModuleId ? (
                <div className="border-2 border-primary bg-background px-4 py-2.5 text-sm shadow-[4px_4px_0_var(--border)] opacity-90">
                  {displayGroups
                    .flatMap((g) => g.modules)
                    .find((m) => m.id === activeModuleId)?.name ?? 'Module'}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </main>
  );
}
