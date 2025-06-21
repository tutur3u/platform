'use client';

import type { WorkspaceTask } from '@ncthub/types/db';
import { Button } from '@ncthub/ui/button';
import { Clock, Play } from '@ncthub/ui/icons';
import { toast } from '@ncthub/ui/sonner';
import { cn } from '@ncthub/utils/format';
import { useCallback, useState } from 'react';

interface QuickTaskTimerProps {
  wsId: string;
  task: Partial<WorkspaceTask>;
  className?: string;
  size?: 'sm' | 'xs';
}

export default function QuickTaskTimer({
  wsId,
  task,
  className,
  size = 'xs',
}: QuickTaskTimerProps) {
  const [isStarting, setIsStarting] = useState(false);

  const apiCall = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return response.json();
    },
    []
  );

  const startTimerForTask = async () => {
    if (!task.id || !task.name) return;

    setIsStarting(true);

    try {
      await apiCall(`/api/v1/workspaces/${wsId}/time-tracking/quick-start`, {
        method: 'POST',
        body: JSON.stringify({
          taskId: task.id,
          taskName: task.name,
          taskDescription: task.description || null,
        }),
      });

      toast.success(`Timer started for "${task.name}"`);
    } catch (error) {
      console.error('Error starting task timer:', error);
      toast.error('Failed to start timer');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="@container">
      <Button
        variant="ghost"
        size={size}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          startTimerForTask();
        }}
        disabled={isStarting}
        className={cn(
          'h-auto p-1 opacity-0 transition-all duration-200 group-hover:opacity-100',
          'hover:bg-primary/10 hover:text-primary',
          size === 'xs' && 'h-6 w-6',
          size === 'sm' && 'h-7 w-7',
          'w-full',
          '@[50px]:opacity-60', // Show partially visible on larger containers
          className
        )}
        title={`Start timer for ${task.name}`}
      >
        {isStarting ? (
          <Clock
            className={cn(
              'animate-spin',
              size === 'xs' && 'h-3 w-3',
              size === 'sm' && 'h-3.5 w-3.5'
            )}
          />
        ) : (
          <Play
            className={cn(
              size === 'xs' && 'h-3 w-3',
              size === 'sm' && 'h-3.5 w-3.5'
            )}
          />
        )}
      </Button>
    </div>
  );
}
