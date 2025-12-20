'use client';

import { ChevronDown } from '@tuturuuu/icons';
import type { GanttTask } from '@tuturuuu/types/primitives/Task';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { cn } from '@tuturuuu/utils/format';

interface AnalyticsFilters {
  timeView: 'week' | 'month' | 'year';
  selectedBoard: string | null;
  statusFilter: 'all' | 'not_started' | 'active' | 'done' | 'closed';
}

interface TimeMarker {
  position: number;
  label: string;
}

interface GanttTimelineProps {
  filters: AnalyticsFilters;
  timeMarkers: TimeMarker[];
  ganttTasks: Array<
    GanttTask & {
      startOffset: number;
      width: number;
      createdDate: Date;
      endDate: Date;
    }
  >;
  handleTaskClick: (
    e: React.MouseEvent,
    task: GanttTask & {
      startOffset: number;
      width: number;
      createdDate: Date;
      endDate: Date;
    }
  ) => void;
}

export function GanttTimeline({
  filters,
  timeMarkers,
  ganttTasks,
  handleTaskClick,
}: GanttTimelineProps) {
  return (
    <>
      {/* Time Scale - Horizontally Scrollable for Year View */}
      <div className="relative mb-4 h-10">
        <div
          className={cn(
            'relative border-b pb-3',
            filters.timeView === 'year'
              ? 'overflow-x-auto overflow-y-hidden'
              : 'overflow-hidden'
          )}
        >
          <div
            className={cn(
              'relative flex',
              filters.timeView === 'year' ? 'h-6 min-w-[1000px]' : 'h-6 w-full'
            )}
          >
            {timeMarkers.map((marker) => (
              <div
                key={`${marker.position}-${marker.label}`}
                className={cn(
                  'flex items-center justify-center whitespace-nowrap text-muted-foreground text-xs',
                  filters.timeView === 'year'
                    ? 'flex-1 px-2 text-center'
                    : 'absolute -translate-x-1/2 transform'
                )}
                style={
                  filters.timeView === 'year'
                    ? {}
                    : {
                        left: `${Math.min(Math.max(marker.position, 8), 92)}%`,
                        top: '0px',
                      }
                }
              >
                {marker.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gantt Chart - Fixed Height Container */}
      <div
        className="relative rounded-lg border bg-background"
        style={{ height: '320px' }} // Fixed height instead of expanding
      >
        {/* Custom scrollbar styles applied via className */}

        {/* Scrollable Content Area */}
        <div
          className="custom-scrollbar h-full overflow-y-auto p-4 pr-2"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#3b82f6 transparent',
          }}
        >
          <div className="space-y-1">
            {ganttTasks.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No tasks found for the selected time period
              </div>
            ) : (
              ganttTasks.map((task) => (
                <div
                  key={task.id}
                  className="group relative flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  {/* Task Info */}
                  <div className="w-52 min-w-0">
                    {/* Task Name with line clamp */}
                    <div
                      className="line-clamp-1 font-medium text-gray-900 text-sm transition-all duration-200 group-hover:line-clamp-none dark:text-gray-100"
                      title={task.name}
                    >
                      {task.name}
                    </div>
                  </div>

                  {/* Timeline Bar */}
                  <div className="relative h-6 flex-1 rounded bg-gray-100 dark:bg-gray-800">
                    <div
                      className={cn(
                        'absolute h-full cursor-pointer rounded transition-all hover:opacity-90',
                        task.status === 'active'
                          ? 'bg-blue-500'
                          : task.status === 'done' || task.status === 'closed'
                            ? 'bg-green-500'
                            : 'bg-gray-400'
                      )}
                      style={{
                        left: `${task.startOffset}%`,
                        width: `${task.width}%`,
                      }}
                    >
                      {/* Status Indicators */}
                      <div className="pointer-events-none absolute inset-y-0 flex w-full items-center justify-between">
                        {/* Not Started (Gray) */}
                        <div
                          className="h-2 w-2 rounded-full bg-gray-400 opacity-70"
                          style={{ left: '0%' }}
                        />

                        {/* In Progress (Blue) */}
                        {task.status === 'active' && (
                          <div
                            className="h-2 w-2 rounded-full bg-blue-500 opacity-70"
                            style={{
                              left: '50%',
                              transform: 'translateX(-50%)',
                            }}
                          />
                        )}

                        {/* Completed (Green) */}
                        {(task.status === 'done' ||
                          task.status === 'closed') && (
                          <div
                            className="h-2 w-2 rounded-full bg-green-500 opacity-70"
                            style={{ right: '0%' }}
                          />
                        )}
                      </div>

                      <div className="flex h-full items-center justify-center font-medium text-white text-xs">
                        {(task.status === 'done' || task.status === 'closed') &&
                        filters.timeView !== 'year' &&
                        task.width > 15
                          ? '✓'
                          : ''}
                      </div>

                      {/* Status transition markers and timeline */}
                      {task.updated_at &&
                        task.updated_at !== task.created_at && (
                          <>
                            {/* Status change marker */}
                            <div
                              className="absolute top-0 h-full w-0.5 bg-yellow-400 opacity-60"
                              style={{ left: '50%' }}
                              title={`Status changed: ${new Date(task.updated_at).toLocaleDateString()}`}
                            />

                            {/* Progress indicator for active tasks */}
                            {task.status === 'active' && (
                              <div className="absolute inset-0 animate-pulse bg-linear-to-r from-transparent via-white/20 to-transparent" />
                            )}
                          </>
                        )}

                      {/* Task lifecycle phases - Individual phase hover targets */}
                      <div className="absolute inset-0 flex">
                        {/* Creation phase (first 25% of timeline) */}
                        <div
                          className="cursor-help bg-gray-300 opacity-30 transition-opacity hover:opacity-50 dark:bg-gray-600"
                          style={{ width: '25%' }}
                          title={`📅 Created: ${task.createdDate.toLocaleDateString()} at ${task.createdDate.toLocaleTimeString()}`}
                        />

                        {/* Active development phase (middle 50%) */}
                        {task.status === 'active' && (
                          <div
                            className="cursor-help bg-blue-400 opacity-40 transition-opacity hover:opacity-60"
                            style={{ width: '50%' }}
                            title={`🔄 In Progress: Started ${task.createdDate.toLocaleDateString()}${task.updated_at ? ` • Last updated: ${new Date(task.updated_at).toLocaleDateString()}` : ''}`}
                          />
                        )}

                        {/* Completion phase (last 25% if completed) */}
                        {(task.status === 'done' ||
                          task.status === 'closed') && (
                          <div
                            className="ml-auto cursor-help bg-green-400 opacity-40 transition-opacity hover:opacity-60"
                            style={{ width: '25%' }}
                            title={`✅ ${task.status === 'done' ? 'Completed' : 'Closed'}: ${task.updated_at ? `${new Date(task.updated_at).toLocaleDateString()} at ${new Date(task.updated_at).toLocaleTimeString()}` : 'Date unknown'}${task.end_date ? ` • Due was: ${new Date(task.end_date).toLocaleDateString()}` : ''}`}
                          />
                        )}

                        {/* Main timeline click area */}
                        <button
                          type="button"
                          className="absolute inset-0 cursor-pointer"
                          onClick={(e) => handleTaskClick(e, task)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              handleTaskClick(
                                e as unknown as React.MouseEvent,
                                task
                              );
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="w-24 text-xs">
                    <Badge
                      variant="outline"
                      className={cn(
                        'border font-medium text-xs',
                        task.status === 'done' &&
                          'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400',
                        task.status === 'closed' &&
                          'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
                        task.status === 'active' &&
                          'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
                        task.status === 'not_started' &&
                          'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                      )}
                    >
                      {task.status === 'done' ? (
                        <span className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                          Done
                        </span>
                      ) : task.status === 'closed' ? (
                        <span className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-purple-500"></span>
                          Closed
                        </span>
                      ) : task.status === 'active' ? (
                        <span className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500"></span>
                          Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400"></span>
                          Pending
                        </span>
                      )}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Legend - Collapsible */}
      <Collapsible className="mt-4 border-t pt-4">
        <CollapsibleTrigger className="group flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <h5 className="font-medium text-sm">Status Legend</h5>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </div>
          <span className="text-muted-foreground text-xs">
            Hover over tasks for detailed timeline
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3">
          <div className="flex flex-wrap items-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-gray-400"></div>
              <span>Not Started</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-blue-500"></div>
              <span>Active</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-green-500"></div>
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1 w-3 rounded bg-yellow-400"></div>
              <span>Status Change</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1 w-3 rounded bg-linear-to-r from-gray-300 via-blue-400 to-green-400"></div>
              <span>Lifecycle Phases</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1 w-3 rounded bg-red-500"></div>
              <span>Overdue</span>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
