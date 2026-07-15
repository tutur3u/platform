'use client';

import { ChevronDown, Plus, Sparkles } from '@tuturuuu/icons';
import type { RelatedTaskInfo } from '@tuturuuu/types/primitives/TaskRelationship';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import * as React from 'react';
import { TaskSearchPopoverContent } from '../task-search-popover';

export interface TaskRelationshipActionButtonsProps {
  wsId: string;
  excludeIds: string[];
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  onAddExisting?: (task: RelatedTaskInfo) => void | Promise<void>;
  onCreateNew?: () => void; // Opens dialog flow, like onAddSubtask
  isSaving: boolean;
  buttonLabel: string;
  createNewLabel: string;
  addExistingLabel: string;
  emptyText?: string;
  disabled?: boolean;
}

export function TaskRelationshipActionButtons({
  wsId,
  excludeIds,
  searchOpen,
  onSearchOpenChange,
  onAddExisting,
  onCreateNew,
  isSaving,
  buttonLabel,
  createNewLabel,
  addExistingLabel,
  emptyText = 'No available tasks',
  disabled = false,
}: TaskRelationshipActionButtonsProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const hasBothOptions = onCreateNew && onAddExisting;

  if (hasBothOptions) {
    // Dropdown menu with both options (like SubtaskActionButtons)
    return (
      <Popover open={searchOpen} onOpenChange={onSearchOpenChange} modal>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-11 w-full justify-between rounded-2xl border-border/70 border-dashed bg-muted/10 px-3 text-muted-foreground hover:border-border hover:bg-muted/20 hover:text-foreground"
              disabled={isSaving || disabled}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-dynamic-purple/10 text-dynamic-purple">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="font-medium">{buttonLabel}</span>
              </div>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-72 rounded-2xl border-border/70 p-1.5"
          >
            {/* Create new - opens dialog */}
            <DropdownMenuItem
              onClick={onCreateNew}
              disabled={isSaving || disabled}
              className="cursor-pointer rounded-xl px-3 py-2.5"
            >
              <Sparkles className="mr-2 h-4 w-4 text-dynamic-purple" />
              <span>{createNewLabel}</span>
            </DropdownMenuItem>
            {/* Add existing - opens search popover */}
            <PopoverTrigger asChild>
              <DropdownMenuItem
                disabled={isSaving || disabled}
                className="cursor-pointer rounded-xl px-3 py-2.5"
                onSelect={(e) => e.preventDefault()}
              >
                <Plus className="mr-2 h-4 w-4 text-dynamic-green" />
                <span>{addExistingLabel}</span>
              </DropdownMenuItem>
            </PopoverTrigger>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Popover content for adding existing task */}
        <PopoverContent
          className="z-9999 w-(--radix-popover-trigger-width) p-0"
          align="start"
          sideOffset={4}
        >
          <TaskSearchPopoverContent
            wsId={wsId}
            excludeTaskIds={excludeIds}
            open={searchOpen}
            onOpenChange={onSearchOpenChange}
            onSelect={async (task) => {
              await onAddExisting(task);
              onSearchOpenChange(false);
            }}
            emptyText={emptyText}
            isSaving={isSaving}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
          />
        </PopoverContent>
      </Popover>
    );
  }

  // Single option - Create new (opens dialog)
  if (onCreateNew && !onAddExisting) {
    return (
      <Button
        variant="outline"
        className="h-11 w-full justify-start gap-3 rounded-2xl border-border/70 border-dashed bg-muted/10 px-3 text-muted-foreground hover:border-border hover:bg-muted/20 hover:text-foreground"
        onClick={onCreateNew}
        disabled={isSaving || disabled}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-dynamic-purple/10 text-dynamic-purple">
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="font-medium">{createNewLabel}</span>
      </Button>
    );
  }

  // Single option - Add existing (opens search popover)
  if (onAddExisting && !onCreateNew) {
    return (
      <Popover open={searchOpen} onOpenChange={onSearchOpenChange} modal>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-11 w-full justify-start gap-3 rounded-2xl border-border/70 border-dashed bg-muted/10 px-3 text-muted-foreground hover:border-border hover:bg-muted/20 hover:text-foreground"
            disabled={isSaving || disabled}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-dynamic-green/10 text-dynamic-green">
              <Plus className="h-4 w-4" />
            </span>
            <span className="font-medium">{addExistingLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="z-9999 w-(--radix-popover-trigger-width) p-0"
          align="start"
          sideOffset={4}
        >
          <TaskSearchPopoverContent
            wsId={wsId}
            excludeTaskIds={excludeIds}
            open={searchOpen}
            onOpenChange={onSearchOpenChange}
            onSelect={async (task) => {
              await onAddExisting(task);
              onSearchOpenChange(false);
            }}
            emptyText={emptyText}
            isSaving={isSaving}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return null;
}
