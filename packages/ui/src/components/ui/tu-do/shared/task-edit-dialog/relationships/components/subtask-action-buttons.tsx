'use client';

import { ChevronDown, Plus, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import * as React from 'react';
import {
  TaskSearchPopover,
  TaskSearchPopoverContent,
} from '../task-search-popover';
import type { SubtaskActionButtonsProps } from '../types/task-relationships.types';

export function SubtaskActionButtons({
  wsId,
  excludeIds,
  searchOpen,
  onSearchOpenChange,
  onAddSubtask,
  onAddExistingAsSubtask,
  isSaving,
  disabled = false,
}: SubtaskActionButtonsProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const hasBothOptions = onAddSubtask && onAddExistingAsSubtask;

  if (hasBothOptions) {
    // Dropdown menu with both options + popover content (no separate trigger)
    return (
      <Popover open={searchOpen} onOpenChange={onSearchOpenChange} modal>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between gap-2 text-muted-foreground"
              disabled={isSaving || disabled}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-dynamic-purple" />
                Add sub-task
              </div>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-full">
            <DropdownMenuItem
              onClick={onAddSubtask}
              disabled={isSaving || disabled}
              className="cursor-pointer"
            >
              <Sparkles className="mr-2 h-4 w-4 text-dynamic-purple" />
              <span>Create new sub-task</span>
            </DropdownMenuItem>
            <PopoverTrigger asChild>
              <DropdownMenuItem
                disabled={isSaving || disabled}
                className="cursor-pointer"
                onSelect={(e) => e.preventDefault()}
              >
                <Plus className="mr-2 h-4 w-4 text-dynamic-green" />
                <span>Add existing task</span>
              </DropdownMenuItem>
            </PopoverTrigger>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Popover content without trigger button */}
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
              await onAddExistingAsSubtask(task);
              onSearchOpenChange(false);
            }}
            emptyText="No available tasks"
            isSaving={isSaving}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
          />
        </PopoverContent>
      </Popover>
    );
  }

  // Single option - Create new
  if (onAddSubtask) {
    return (
      <Button
        variant="outline"
        className="w-full justify-start gap-2 text-muted-foreground"
        onClick={onAddSubtask}
        disabled={isSaving || disabled}
      >
        <Sparkles className="h-4 w-4 text-dynamic-purple" />
        Create new sub-task
      </Button>
    );
  }

  // Single option - Add existing
  if (onAddExistingAsSubtask) {
    return (
      <TaskSearchPopover
        wsId={wsId}
        excludeTaskIds={excludeIds}
        open={searchOpen}
        onOpenChange={onSearchOpenChange}
        onSelect={async (task) => {
          await onAddExistingAsSubtask(task);
          onSearchOpenChange(false);
        }}
        placeholder="Add existing task as sub-task..."
        emptyText="No available tasks"
        isSaving={isSaving}
        disabled={disabled}
      />
    );
  }

  return null;
}
