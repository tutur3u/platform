'use client';

import {
  CheckCircle,
  Copy,
  MapPin,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Tag,
  Trash2,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import type {
  ExtendedWorkspaceTask,
  SessionWithRelations,
} from '../../../../time-tracker/types';
import { formatDuration, getCategoryColor } from '../utils';

interface SessionCardProps {
  session: SessionWithRelations;
  tasks: ExtendedWorkspaceTask[];
  isHighlighted?: boolean;
  isResuming?: boolean;
  onResume: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function SessionCard({
  session,
  tasks,
  isHighlighted,
  isResuming,
  onResume,
  onDuplicate,
  onDelete,
}: SessionCardProps) {
  const taskWithDetails = tasks.find((t) => t.id === session.task?.id);

  return (
    <div
      className={cn(
        'group relative rounded-lg border @lg:p-4 p-3 transition-all hover:bg-accent/50 hover:shadow-sm',
        isHighlighted &&
          'slide-in-from-top animate-in bg-dynamic-green/10 ring-2 ring-dynamic-green duration-500'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="truncate font-medium @lg:text-base text-sm">
            {session.title}
          </h4>
          {session.description && (
            <p className="mt-1 line-clamp-2 @lg:text-sm text-muted-foreground text-xs">
              {session.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center @lg:gap-2 gap-1">
            {session.category && (
              <Badge
                variant="secondary"
                className={cn(
                  '@lg:text-sm text-xs',
                  getCategoryColor(session.category.color || 'BLUE')
                )}
              >
                {session.category.name}
              </Badge>
            )}
            {session.task && (
              <div className="flex items-center gap-1.5 rounded-md border border-dynamic-blue/20 bg-linear-to-r from-dynamic-blue/10 to-dynamic-blue/5 px-2 py-1">
                <CheckCircle className="h-3 w-3 text-dynamic-blue" />
                <span className="font-medium @lg:text-sm text-dynamic-blue text-xs">
                  {session.task.name}
                </span>
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

        <div className="flex items-start gap-2">
          <div className="text-right">
            <p className="font-medium @lg:text-base text-sm">
              {session.duration_seconds
                ? formatDuration(session.duration_seconds)
                : '-'}
            </p>
            <p className="@lg:text-sm text-muted-foreground text-xs">
              {new Date(session.start_time).toLocaleDateString()}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onResume} disabled={isResuming}>
                {isResuming ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                Start New Session
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <Separator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Session
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
