'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  SquareChevronRight,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import type { SidebarNavigationPlacement } from '../../app/[locale]/(dashboard)/[wsId]/sidebar-navigation-preferences';
import type { NavigationItemDefinition } from './sidebar-navigation-layout-settings.types';

function IconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={disabled}
          onClick={onClick}
        >
          {children}
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function SortableNavigationItem({
  definition,
  hidden,
  isFirst,
  isLast,
  labels,
  locked,
  onHideToggle,
  onMove,
  onMoveDown,
  onMoveToOtherSection,
  onMoveUp,
  placement,
}: {
  definition: NavigationItemDefinition;
  hidden: boolean;
  isFirst: boolean;
  isLast: boolean;
  labels: {
    drag: string;
    hide: string;
    locked: string;
    moveDown: string;
    moveToMore: string;
    moveToRoot: string;
    moveUp: string;
    show: string;
  };
  locked?: boolean;
  onHideToggle: () => void;
  onMove: boolean;
  onMoveDown: () => void;
  onMoveToOtherSection: () => void;
  onMoveUp: () => void;
  placement: SidebarNavigationPlacement;
}) {
  const Icon = definition.icon;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: definition.id,
    disabled: hidden || locked,
  });

  const placementLabel =
    placement === 'root' ? labels.moveToMore : labels.moveToRoot;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        'flex min-h-9 items-center gap-1 rounded-md border border-border/70 bg-background/70 px-1.5 py-1',
        isDragging && 'opacity-60 shadow-sm',
        hidden && 'border-dashed opacity-70'
      )}
    >
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        disabled={hidden || locked}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
        <span className="sr-only">{labels.drag}</span>
      </button>
      <Icon className="h-4 w-4 flex-none text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-medium text-sm">
        {definition.title}
      </span>
      <IconButton
        label={labels.moveUp}
        onClick={onMoveUp}
        disabled={!onMove || isFirst || hidden || locked}
      >
        <ArrowUp className="h-4 w-4" />
      </IconButton>
      <IconButton
        label={labels.moveDown}
        onClick={onMoveDown}
        disabled={!onMove || isLast || hidden || locked}
      >
        <ArrowDown className="h-4 w-4" />
      </IconButton>
      {!hidden && !locked && (
        <IconButton label={placementLabel} onClick={onMoveToOtherSection}>
          <SquareChevronRight
            className={cn('h-4 w-4', placement === 'more' && 'rotate-180')}
          />
        </IconButton>
      )}
      {locked ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground">
              <Lock className="h-4 w-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent>{labels.locked}</TooltipContent>
        </Tooltip>
      ) : (
        <IconButton
          label={hidden ? labels.show : labels.hide}
          onClick={onHideToggle}
        >
          {hidden ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
        </IconButton>
      )}
    </div>
  );
}
