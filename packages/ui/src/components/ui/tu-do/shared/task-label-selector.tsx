'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Plus, Tag, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@tuturuuu/ui/command';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';

interface TaskLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

interface Props {
  wsId: string;
  taskId?: string; // Optional for new tasks
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
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  // Fetch available labels for the workspace
  const { data: availableLabels = [], isLoading } = useQuery({
    queryKey: ['workspace-labels', wsId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/labels`);
      if (!response.ok) throw new Error('Failed to fetch labels');
      return response.json() as Promise<TaskLabel[]>;
    },
    enabled: !!wsId,
  });

  const handleLabelToggle = async (label: TaskLabel) => {
    const isSelected = selectedLabels.some((l) => l.id === label.id);

    if (isSelected) {
      // Remove label
      if (taskId) {
        try {
          const response = await fetch(
            `/api/v1/workspaces/${wsId}/tasks/${taskId}/labels?label_id=${label.id}`,
            { method: 'DELETE' }
          );
          if (!response.ok) throw new Error('Failed to remove label');
        } catch (error) {
          console.error('Error removing label:', error);
          toast({
            title: 'Error',
            description: 'Failed to remove label from task',
            variant: 'destructive',
          });
          return;
        }
      }

      onLabelsChange(selectedLabels.filter((l) => l.id !== label.id));
    } else {
      // Add label
      if (taskId) {
        try {
          const response = await fetch(
            `/api/v1/workspaces/${wsId}/tasks/${taskId}/labels`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ label_id: label.id }),
            }
          );
          if (!response.ok) throw new Error('Failed to assign label');
        } catch (error) {
          console.error('Error assigning label:', error);
          toast({
            title: 'Error',
            description: 'Failed to assign label to task',
            variant: 'destructive',
          });
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
      {/* Selected Labels */}
      {selectedLabels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedLabels.map((label) => (
            <Badge
              key={label.id}
              style={{ backgroundColor: label.color, color: '#fff' }}
              className="cursor-pointer hover:opacity-80"
            >
              {label.name}
              {!disabled && (
                <X
                  className="ml-1 h-3 w-3 rounded-full hover:bg-white/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveLabel(label.id);
                  }}
                />
              )}
            </Badge>
          ))}
        </div>
      )}

      {/* Label Selector */}
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
                        <div className="flex flex-1 items-center space-x-2">
                          <Badge
                            style={{
                              backgroundColor: label.color,
                              color: '#fff',
                            }}
                            className="text-xs"
                          >
                            {label.name}
                          </Badge>
                          {isSelected && (
                            <Check className="ml-auto h-4 w-4 text-primary" />
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
