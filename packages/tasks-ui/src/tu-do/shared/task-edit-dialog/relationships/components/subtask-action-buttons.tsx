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
              className="h-11 w-full justify-between rounded-2xl border-border/70 border-dashed bg-muted/10 px-3 text-muted-foreground hover:border-border hover:bg-muted/20 hover:text-foreground"
              disabled={isSaving || disabled}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-dynamic-purple/10 text-dynamic-purple">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="font-medium">Add sub-task</span>
              </div>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-72 rounded-2xl border-border/70 p-1.5"
          >
            <DropdownMenuItem
              onClick={onAddSubtask}
              disabled={isSaving || disabled}
              className="cursor-pointer rounded-xl px-3 py-2.5"
            >
              <Sparkles className="mr-2 h-4 w-4 text-dynamic-purple" />
              <span>Create new sub-task</span>
            </DropdownMenuItem>
            <PopoverTrigger asChild>
              <DropdownMenuItem
                disabled={isSaving || disabled}
                className="cursor-pointer rounded-xl px-3 py-2.5"
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
        className="h-11 w-full justify-start gap-3 rounded-2xl border-border/70 border-dashed bg-muted/10 px-3 text-muted-foreground hover:border-border hover:bg-muted/20 hover:text-foreground"
        onClick={onAddSubtask}
        disabled={isSaving || disabled}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-dynamic-purple/10 text-dynamic-purple">
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="font-medium">Create new sub-task</span>
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
