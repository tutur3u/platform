'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Clock, Play } from '@tuturuuu/icons';
import type { WorkspaceTask } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { startTaskTimeTrackingSession } from '../../tu-do/shared/task-time-tracking-api';

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
  const queryClient = useQueryClient();
  const [isStarting, setIsStarting] = useState(false);

  const startTimerForTask = async () => {
    if (!task.id || !task.name) return;

    setIsStarting(true);

    try {
      const session = await startTaskTimeTrackingSession(wsId, {
        taskId: task.id,
        taskName: task.name,
        description: task.description || null,
      });

      queryClient.setQueryData(['running-time-session', wsId], session);

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
          void startTimerForTask();
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
