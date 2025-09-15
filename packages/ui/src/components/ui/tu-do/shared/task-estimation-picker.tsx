'use client';

import { useQuery } from '@tanstack/react-query';
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
import { Calculator, Check, ChevronDown } from '@tuturuuu/ui/icons';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useMemo, useState } from 'react';
import {
  buildEstimationIndices,
  mapEstimationPoints,
} from './estimation-mapping';

type EstimationType = 'fibonacci' | 'linear' | 'exponential' | 't-shirt';

interface BoardEstimationConfig {
  id: string;
  name: string;
  estimation_type: EstimationType | null;
  extended_estimation: boolean;
  allow_zero_estimates: boolean;
}

interface Props {
  wsId: string;
  boardId?: string;
  taskId?: string; // Optional for new tasks
  selectedPoints?: number | null;
  onPointsChange: (points: number | null) => void;
  disabled?: boolean;
}

export function TaskEstimationPicker({
  wsId,
  boardId,
  taskId,
  selectedPoints,
  onPointsChange,
  disabled = false,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  // Fetch board estimation configuration
  const { data: boardConfig, isLoading } = useQuery({
    queryKey: ['board-estimation-config', wsId, boardId],
    queryFn: async () => {
      if (!boardId) return null;
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/boards/${boardId}/estimation`
      );
      if (!response.ok) {
        // If the endpoint doesn't exist, we'll create a fallback
        const boardResponse = await fetch(`/api/v1/workspaces/${wsId}/boards`);
        if (!boardResponse.ok) throw new Error('Failed to fetch boards');
        const boards = await boardResponse.json();
        const board = boards.find((b: any) => b.id === boardId);
        return board || null;
      }
      return response.json() as Promise<BoardEstimationConfig>;
    },
    enabled: !!wsId && !!boardId,
  });

  const handlePointsChange = async (points: number | null) => {
    if (taskId && boardConfig) {
      try {
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/tasks/${taskId}/estimation`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estimation_points: points }),
          }
        );
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to update estimation');
        }
      } catch (error) {
        console.error('Error updating estimation:', error);
        toast({
          title: 'Error',
          description:
            error instanceof Error
              ? error.message
              : 'Failed to update task estimation',
          variant: 'destructive',
        });
        return;
      }
    }

    onPointsChange(points);
    setOpen(false);
  };

  const estimationValues = useMemo(() => {
    if (!boardConfig.estimation_type) return [];
    const indices = buildEstimationIndices({
      extended: boardConfig.extended_estimation,
      allowZero: boardConfig.allow_zero_estimates,
    });
    // Always include a null option first for clearing estimation
    const options: {
      value: number | null;
      label: string;
      disabled?: boolean;
    }[] = [{ value: null, label: 'Not estimated' }];
    for (const idx of indices) {
      const label = mapEstimationPoints(idx, boardConfig.estimation_type);
      options.push({ value: idx, label });
    }
    return options;
  }, [
    boardConfig.estimation_type,
    boardConfig.extended_estimation,
    boardConfig.allow_zero_estimates,
  ]);

  // If board is not configured for estimation, show message
  if (!isLoading && (!boardConfig || !boardConfig.estimation_type)) {
    return (
      <div className="text-center text-muted-foreground text-sm">
        <Calculator className="mx-auto mb-2 h-6 w-6" />
        <p>Estimation not configured</p>
        <p className="text-xs">Configure estimation in board settings</p>
      </div>
    );
  }

  if (isLoading || !boardConfig) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Calculator className="h-4 w-4" />
        <span>Loading estimation config...</span>
      </div>
    );
  }

  const selectedValue = estimationValues.find(
    (v) => v.value === selectedPoints
  );

  return (
    <div className="space-y-2">
      <Label className="font-medium text-xs">Estimation</Label>

      {disabled ? (
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-muted-foreground" />
          {selectedValue ? (
            <Badge variant="secondary" className="text-xs">
              {selectedValue.label}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-sm">Not estimated</span>
          )}
        </div>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'h-8 justify-between text-left font-normal',
                !selectedValue && 'text-muted-foreground'
              )}
            >
              <div className="flex items-center gap-2">
                <Calculator className="h-3 w-3" />
                {selectedValue ? selectedValue.label : 'Not estimated'}
              </div>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search estimation..." />
              <CommandList>
                <CommandEmpty>No estimation values found.</CommandEmpty>
                <CommandGroup>
                  {estimationValues.map((item) => {
                    const key = item.value === null ? 'null' : item.value;
                    return (
                      <CommandItem
                        key={key}
                        onSelect={() => handlePointsChange(item.value)}
                        className="cursor-pointer"
                      >
                        <div className="flex w-full items-center justify-between">
                          <span>{item.label}</span>
                          {selectedPoints === item.value && (
                            <Check className="h-4 w-4 text-primary" />
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

      {boardConfig.estimation_type && (
        <p className="text-muted-foreground text-xs">
          {boardConfig.estimation_type} scale
          {boardConfig.extended_estimation && ' (extended)'}
        </p>
      )}
    </div>
  );
}
