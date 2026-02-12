'use client';

import { CheckCircle, MapPin, Pause, Square, Tag } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { Badge } from '../../../../badge';
import { Button } from '../../../../button';
import type {
  ExtendedWorkspaceTask,
  SessionWithRelations,
} from '../../../../time-tracker/types';
import { formatTime, getCategoryColor } from '../utils';

interface ActiveSessionCardProps {
  session: SessionWithRelations;
  elapsedTime: number;
  isLoading: boolean;
  onPause: () => void;
  onStop: () => void;
  tasks: ExtendedWorkspaceTask[];
}

export function ActiveSessionCard({
  session,
  elapsedTime,
  isLoading,
  onPause,
  onStop,
  tasks,
}: ActiveSessionCardProps) {
  const taskWithDetails = tasks.find((t) => t.id === session.task?.id);

  return (
    <div className="space-y-4 text-center">
      <div className="relative overflow-hidden rounded-lg bg-linear-to-br from-dynamic-red/10 to-dynamic-red/20 @lg:p-6 p-4">
        <div className="absolute inset-0 animate-pulse bg-linear-to-r from-dynamic-red/10 to-transparent opacity-30" />
        <div className="relative">
          <div className="font-bold font-mono @lg:text-4xl text-3xl text-dynamic-red transition-all duration-300">
            {formatTime(elapsedTime)}
          </div>
          <div className="mt-2 flex items-center gap-2 @lg:text-sm text-dynamic-red/70 text-xs">
            <div className="h-2 w-2 animate-pulse rounded-full bg-dynamic-red" />
            Started at {new Date(session.start_time).toLocaleTimeString()}
          </div>
        </div>
      </div>

      <div className="text-left">
        <h3 className="font-medium @lg:text-base text-sm">{session.title}</h3>
        {session.description && (
          <p className="mt-1 @lg:text-sm text-muted-foreground text-xs">
            {session.description}
          </p>
        )}
        <div className="mt-2 flex flex-wrap @lg:gap-2 gap-1">
          {session.category && (
            <Badge
              className={cn(
                '@lg:text-sm text-xs',
                getCategoryColor(session.category.color || 'BLUE')
              )}
            >
              {session.category.name}
            </Badge>
          )}
          {session.task && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-md border border-dynamic-blue/20 bg-linear-to-r from-dynamic-blue/10 to-dynamic-blue/5 px-2 py-1">
                <CheckCircle className="h-3 w-3 text-dynamic-blue" />
                <span className="font-medium @lg:text-sm text-dynamic-blue text-xs">
                  {session.task.name}
                </span>
              </div>
            </div>
          )}
        </div>
        {taskWithDetails?.board_name && taskWithDetails?.list_name && (
          <div className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span>{taskWithDetails.board_name}</span>
            </div>
            <span>-</span>
            <div className="flex items-center gap-1">
              <Tag className="h-3 w-3" />
              <span>{taskWithDetails.list_name}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          onClick={onPause}
          disabled={isLoading}
          variant="outline"
          className="flex-1"
        >
          <Pause className="mr-2 h-4 w-4" />
          Pause
        </Button>
        <Button
          onClick={onStop}
          disabled={isLoading}
          variant="destructive"
          className="flex-1"
        >
          <Square className="mr-2 h-4 w-4" />
          Stop
        </Button>
      </div>
    </div>
  );
}
