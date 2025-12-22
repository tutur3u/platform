'use client';

import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  Lock,
  Unlock,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useState } from 'react';
import type { ScheduledCalendarEvent } from './task-properties-section';

interface TaskInstancesSectionProps {
  wsId: string;
  taskId?: string;
  scheduledEvents?: ScheduledCalendarEvent[];
  className?: string;
  onLockToggle?: (eventId: string, currentLocked: boolean) => Promise<void>;
  isLocking?: string | null;
}

export function TaskInstancesSection({
  scheduledEvents = [],
  className,
  onLockToggle,
  isLocking,
}: TaskInstancesSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (scheduledEvents.length === 0) return null;

  return (
    <div className={cn('border-t bg-muted/5', className)}>
      {/* Section Header - Collapsible */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-4 py-3 transition-colors hover:bg-muted/50 md:px-8"
      >
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-foreground/80 text-sm">
          Scheduled Instances
        </span>
        <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
          {scheduledEvents.length}
        </Badge>
        {isExpanded ? (
          <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="overflow-hidden">
          <div className="px-4 pb-4 md:px-8">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {scheduledEvents
                .sort((a, b) => dayjs(a.start_at).diff(dayjs(b.start_at)))
                .map((event) => {
                  const isLocked = event.locked ?? false;
                  const locking = isLocking === event.id;

                  return (
                    <div
                      key={event.id}
                      className="group flex flex-col gap-2 rounded-lg border bg-background p-3 transition-all hover:border-primary/30 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            {event.completed ? (
                              <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                            ) : (
                              <Clock className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="truncate font-semibold text-sm">
                              {event.title}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
                            <span className="font-medium text-foreground/70">
                              {dayjs(event.start_at).format('MMM D, YYYY')}
                            </span>
                            <span className="hidden opacity-50 sm:inline">
                              •
                            </span>
                            <span>
                              {dayjs(event.start_at).format('h:mm A')} -{' '}
                              {dayjs(event.end_at).format('h:mm A')}
                            </span>
                            <span className="hidden opacity-50 sm:inline">
                              •
                            </span>
                            <span className="rounded bg-muted px-1.5 py-0.5">
                              {event.scheduled_minutes}m
                            </span>
                          </div>
                        </div>

                        {onLockToggle && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={cn(
                                    'h-8 w-8 shrink-0 transition-colors',
                                    isLocked
                                      ? 'bg-primary/5 text-primary hover:bg-primary/10'
                                      : 'text-muted-foreground hover:bg-muted'
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onLockToggle(event.id, isLocked);
                                  }}
                                  disabled={locking}
                                >
                                  {locking ? (
                                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                  ) : isLocked ? (
                                    <Lock className="h-3.5 w-3.5" />
                                  ) : (
                                    <Unlock className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                {isLocked ? 'Unlock event' : 'Lock event'}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>

                      {event.scheduling_reason && (
                        <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground transition-colors group-hover:bg-muted/80">
                          <Info className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {event.scheduling_reason}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
