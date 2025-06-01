'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceTask } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Clock, Play } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { toast } from 'sonner';

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
  const supabase = createClient();

  const startTimerForTask = async () => {
    if (!task.id || !task.name) return;

    setIsStarting(true);

    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        toast.error('Not authenticated');
        return;
      }

      // First, stop any running timers
      const { error: stopError } = await supabase
        .from('time_tracking_sessions')
        .update({
          end_time: new Date().toISOString(),
          is_running: false,
        })
        .eq('ws_id', wsId)
        .eq('user_id', user.data.user.id)
        .eq('is_running', true);

      if (stopError) {
        console.warn('Error stopping previous timers:', stopError);
      }

      // Start new timer for this task
      const { error: startError } = await supabase
        .from('time_tracking_sessions')
        .insert({
          ws_id: wsId,
          user_id: user.data.user.id,
          task_id: task.id,
          title: `Working on: ${task.name}`,
          description: task.description || null,
          start_time: new Date().toISOString(),
          is_running: true,
        });

      if (startError) throw startError;

      toast.success(`Timer started for "${task.name}"`);
    } catch (error) {
      console.error('Error starting task timer:', error);
      toast.error('Failed to start timer');
    } finally {
      setIsStarting(false);
    }
  };

  return (
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
        'h-auto p-1 opacity-0 transition-opacity group-hover:opacity-100',
        size === 'xs' && 'h-6 w-6',
        size === 'sm' && 'h-7 w-7',
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
  );
}
