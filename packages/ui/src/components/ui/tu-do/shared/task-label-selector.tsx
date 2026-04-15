'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Plus, Tag, X } from '@tuturuuu/icons';
import {
  addWorkspaceTaskLabel,
  removeWorkspaceTaskLabel,
} from '@tuturuuu/internal-api/tasks';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import { LabelChip, type TaskLabel } from './label-chip';

interface Props {
  wsId: string;
  taskId?: string;
  selectedLabels?: TaskLabel[];
  onLabelsChange: (labels: TaskLabel[]) => void;
  disabled?: boolean;
}

export function TaskLabelSelector({
  wsId,
  taskId,
  selectedLabels = [],
  onLabelsChange,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const { data: availableLabels = [], isLoading } = useQuery({
    queryKey: ['workspace-labels', wsId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/labels`);
      if (!response.ok) throw new Error('Failed to fetch labels');
      return response.json() as Promise<TaskLabel[]>;
    },
    enabled: !!wsId,
  });

  const assignLabelMutation = useMutation({
    mutationFn: async (labelId: string) => {
      if (!taskId) return;
      await addWorkspaceTaskLabel(wsId, taskId, labelId);
    },
    onError: (error) => {
      console.error('Error assigning label:', error);
      toast.error('Failed to assign label to task');
    },
  });

  const removeLabelMutation = useMutation({
    mutationFn: async (labelId: string) => {
      if (!taskId) return;
      await removeWorkspaceTaskLabel(wsId, taskId, labelId);
    },
    onError: (error) => {
      console.error('Error removing label:', error);
      toast.error('Failed to remove label from task');
    },
  });

  const handleLabelToggle = async (label: TaskLabel) => {
    const isSelected = selectedLabels.some((l) => l.id === label.id);

    if (isSelected) {
      if (taskId) {
        try {
          await removeLabelMutation.mutateAsync(label.id);
        } catch {
          return;
        }
      }

      onLabelsChange(selectedLabels.filter((l) => l.id !== label.id));
    } else {
      if (taskId) {
        try {
          await assignLabelMutation.mutateAsync(label.id);
        } catch {
          return;
        }
      }

      onLabelsChange([...selectedLabels, label]);
    }
  };

  const handleRemoveLabel = async (labelId: string) => {
    const label = selectedLabels.find((l) => l.id === labelId);
    if (label) {
      await handleLabelToggle(label);
    }
  };

  if (availableLabels.length === 0 && !isLoading) {
    return (
      <div className="text-center text-muted-foreground text-sm">
        <Tag className="mx-auto mb-2 h-6 w-6" />
        <p>No labels available</p>
        <p className="text-xs">Create labels in workspace settings</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {selectedLabels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedLabels.map((label) => (
            <div key={label.id} className="group flex items-center gap-0.5">
              <LabelChip
                label={label}
                isDark={isDark}
                className="h-5 px-1.5 text-[10px]"
              />
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${label.name}`}
                  title={`Remove ${label.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveLabel(label.id);
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-border focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'h-8 justify-start text-left font-normal',
                selectedLabels.length === 0 && 'text-muted-foreground'
              )}
            >
              <Plus className="mr-2 h-3 w-3" />
              {selectedLabels.length === 0 ? 'Add labels' : 'Add more labels'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search labels..." />
              <CommandList>
                <CommandEmpty>
                  <div className="py-4 text-center">
                    <Tag className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">
                      No labels found
                    </p>
                  </div>
                </CommandEmpty>
                <CommandGroup>
                  {availableLabels.map((label) => {
                    const isSelected = selectedLabels.some(
                      (l) => l.id === label.id
                    );
                    return (
                      <CommandItem
                        key={label.id}
                        onSelect={() => handleLabelToggle(label)}
                        className="cursor-pointer"
                      >
                        <div className="flex flex-1 items-center gap-2 pr-2">
                          <LabelChip
                            label={label}
                            isDark={isDark}
                            showIcon={false}
                            className="h-5.5 px-1.5 text-[10px]"
                          />
                          {isSelected && (
                            <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
