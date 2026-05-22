'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Label } from '@tuturuuu/ui/label';
import { Fragment } from 'react';
import type { SidebarNavigationPlacement } from '../../app/[locale]/(dashboard)/[wsId]/sidebar-navigation-preferences';
import type { NavigationItemDefinition } from './sidebar-navigation-layout-settings.types';
import { SortableNavigationItem } from './sidebar-navigation-layout-settings-row';

export function SidebarNavigationLayoutSection({
  emptyLabel,
  hidden = false,
  itemCountLabel,
  items,
  labels,
  onDragEnd,
  onHideToggle,
  onMoveDown,
  onMoveToOtherSection,
  onMoveUp,
  placement,
  showSectionLabels = false,
  title,
}: {
  emptyLabel: string;
  hidden?: boolean;
  itemCountLabel?: string;
  items: NavigationItemDefinition[];
  labels: {
    drag: (item: string) => string;
    hide: (item: string) => string;
    locked: string;
    moveDown: (item: string) => string;
    moveToMore: string;
    moveToRoot: string;
    moveUp: (item: string) => string;
    show: (item: string) => string;
  };
  onDragEnd?: (event: DragEndEvent) => void;
  onHideToggle: (id: string) => void;
  onMoveDown: (id: string) => void;
  onMoveToOtherSection: (id: string) => void;
  onMoveUp: (id: string) => void;
  placement: SidebarNavigationPlacement;
  showSectionLabels?: boolean;
  title: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const content = (
    <div className="space-y-1.5">
      {items.map((item, index) => {
        const previousSectionLabel = items[index - 1]?.sectionLabel;
        const shouldShowSectionLabel =
          showSectionLabels &&
          item.sectionLabel &&
          item.sectionLabel !== previousSectionLabel;

        return (
          <Fragment key={item.id}>
            {shouldShowSectionLabel && (
              <div className="px-1 pt-2 text-[11px] text-muted-foreground uppercase tracking-wider">
                {item.sectionLabel}
              </div>
            )}
            <SortableNavigationItem
              definition={item}
              hidden={hidden}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              labels={{
                drag: labels.drag(item.title),
                hide: labels.hide(item.title),
                locked: labels.locked,
                moveDown: labels.moveDown(item.title),
                moveToMore: labels.moveToMore,
                moveToRoot: labels.moveToRoot,
                moveUp: labels.moveUp(item.title),
                show: labels.show(item.title),
              }}
              locked={item.locked}
              onHideToggle={() => onHideToggle(item.id)}
              onMove={items.length > 1}
              onMoveDown={() => onMoveDown(item.id)}
              onMoveToOtherSection={() => onMoveToOtherSection(item.id)}
              onMoveUp={() => onMoveUp(item.id)}
              placement={placement}
            />
          </Fragment>
        );
      })}
      {items.length === 0 && (
        <p className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
          {emptyLabel}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{title}</Label>
        {itemCountLabel && (
          <span className="text-muted-foreground text-xs">
            {itemCountLabel}
          </span>
        )}
      </div>
      {hidden ? (
        content
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={items.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            {content}
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
