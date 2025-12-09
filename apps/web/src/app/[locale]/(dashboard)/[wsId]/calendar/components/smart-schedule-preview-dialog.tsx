'use client';

import type { PreviewEvent } from '@/lib/calendar/unified-scheduler/preview-engine';
import {
  AlertTriangle,
  Bug,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Info,
  Loader2,
  Pause,
  Play,
  Sparkles,
  X,
} from '@tuturuuu/icons';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { Progress } from '@tuturuuu/ui/progress';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useRef, useState } from 'react';

interface SmartSchedulePreviewDialogProps {
  wsId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: 'instant' | 'animated';
}

interface PreviewData {
  events: PreviewEvent[];
  steps: Array<{
    step: number;
    type: string;
    action: string;
    description: string;
    event?: PreviewEvent;
    timestamp: number;
  }>;
  summary: {
    totalEvents: number;
    habitsScheduled: number;
    tasksScheduled: number;
    partiallyScheduledTasks: number;
    unscheduledTasks: number;
  };
  warnings: string[];
  tasks?: {
    details: Array<{
      taskId: string;
      taskName: string;
      scheduledMinutes: number;
      totalMinutesRequired: number;
      remainingMinutes: number;
      warning?: string;
      warningLevel?: 'info' | 'warning' | 'error';
    }>;
  };
  habits?: {
    total: number;
  };
  debug?: {
    habitsWithAutoSchedule: number;
    tasksWithAutoSchedule: number;
    existingEventsCount: number;
  };
}

export function SmartSchedulePreviewDialog({
  wsId,
  open,
  onOpenChange,
  initialMode = 'instant',
}: SmartSchedulePreviewDialogProps) {
  const { setPreviewEvents, clearPreviewEvents } = useCalendar();
  const { refresh } = useCalendarSync();

  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [mode, setMode] = useState<'instant' | 'animated'>(initialMode);

  // Animation state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const animationRef = useRef<NodeJS.Timeout | null>(null);

  // Set mode when dialog opens with a different initialMode
  useEffect(() => {
    if (open) {
      setMode(initialMode);
    }
  }, [open, initialMode]);

  // Fetch preview on dialog open
  useEffect(() => {
    if (open && !previewData && !isLoading) {
      fetchPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Clear preview when dialog closes
  useEffect(() => {
    if (!open) {
      clearPreviewEvents();
      setPreviewData(null);
      setCurrentStep(0);
      setIsPlaying(false);
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    }
  }, [open, clearPreviewEvents]);

  // Update calendar preview events when mode/step changes
  useEffect(() => {
    if (!previewData) return;

    if (mode === 'instant') {
      // Show all events instantly
      const calendarEvents = convertToCalendarEvents(previewData.events);
      setPreviewEvents(calendarEvents);
    } else {
      // Show events up to current step
      const stepsWithEvents = previewData.steps.filter((s) => s.event);
      const eventsUpToStep = stepsWithEvents
        .slice(0, currentStep + 1)
        .map((s) => s.event!)
        .filter(Boolean);
      const calendarEvents = convertToCalendarEvents(eventsUpToStep);
      setPreviewEvents(calendarEvents);
    }
  }, [previewData, mode, currentStep, setPreviewEvents]);

  // Animation playback
  useEffect(() => {
    if (!isPlaying || mode !== 'animated' || !previewData) return;

    const stepsWithEvents = previewData.steps.filter((s) => s.event);
    if (currentStep >= stepsWithEvents.length - 1) {
      setIsPlaying(false);
      return;
    }

    animationRef.current = setTimeout(() => {
      setCurrentStep((prev) => prev + 1);
    }, 800); // 800ms delay between steps

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, [isPlaying, currentStep, mode, previewData]);

  const fetchPreview = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/calendar/schedule/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ windowDays: 30 }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate preview');
      }

      // Merge preview data with tasks details and debug info from top-level response
      setPreviewData({
        ...result.preview,
        tasks: result.tasks,
        habits: result.habits,
        debug: result.debug,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to generate preview'
      );
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  }, [wsId, onOpenChange]);

  const handleApply = async () => {
    setIsApplying(true);
    toast.loading('Applying schedule...', { id: 'apply-schedule' });

    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/calendar/schedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ windowDays: 30, forceReschedule: true }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Scheduling failed');
      }

      refresh();
      clearPreviewEvents();

      toast.success(
        `Scheduled ${result.summary.eventsCreated} events (${result.summary.habitsScheduled} habits, ${result.summary.tasksScheduled} tasks)`,
        { id: 'apply-schedule' }
      );

      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Scheduling failed',
        { id: 'apply-schedule' }
      );
    } finally {
      setIsApplying(false);
    }
  };

  const handleDiscard = () => {
    clearPreviewEvents();
    onOpenChange(false);
  };

  // Animation controls
  const togglePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      // Reset if at end
      const stepsWithEvents = previewData?.steps.filter((s) => s.event) || [];
      if (currentStep >= stepsWithEvents.length - 1) {
        setCurrentStep(0);
      }
      setIsPlaying(true);
    }
  };

  const stepForward = () => {
    const stepsWithEvents = previewData?.steps.filter((s) => s.event) || [];
    if (currentStep < stepsWithEvents.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const stepBackward = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const convertToCalendarEvents = (events: PreviewEvent[]): CalendarEvent[] => {
    return events.map((e) => ({
      id: e.id,
      title: e.title,
      start_at: e.start_at,
      end_at: e.end_at,
      color: e.color as any,
      _isPreview: true,
      _previewStep: e.step,
      _previewType: e.type,
      _previewSourceId: e.source_id,
    }));
  };

  const stepsWithEvents = previewData?.steps.filter((s) => s.event) || [];
  const totalSteps = stepsWithEvents.length;
  const isDev = process.env.NODE_ENV === 'development';

  const downloadFullDebugLog = () => {
    if (!previewData) return;

    const eventsLog = previewData.events
      .map(
        (e, i) =>
          `${i + 1}. [${e.type}] "${e.title}" - ${new Date(e.start_at).toLocaleString()} to ${new Date(e.end_at).toLocaleTimeString()}`
      )
      .join('\n');

    const stepsLog = previewData.steps
      .map((s) => `[Step ${s.step}] ${s.type}: ${s.action} - ${s.description}`)
      .join('\n');

    const taskDetailsLog =
      previewData.tasks?.details
        ?.map(
          (t) =>
            `- ${t.taskName}: ${t.scheduledMinutes}/${t.totalMinutesRequired}min (${t.remainingMinutes}min remaining) ${t.warning ? `[${t.warningLevel}] ${t.warning}` : ''}`
        )
        .join('\n') || 'No task details';

    const logContent = `Smart Schedule Preview - Full Debug Log
========================================
Generated: ${new Date().toISOString()}
Workspace: ${wsId}

=== SUMMARY ===
Total Events Generated: ${previewData.summary.totalEvents}
Habits Scheduled: ${previewData.summary.habitsScheduled}
Tasks Scheduled: ${previewData.summary.tasksScheduled}
Partially Scheduled Tasks: ${previewData.summary.partiallyScheduledTasks}
Unscheduled Tasks: ${previewData.summary.unscheduledTasks}

=== INPUT COUNTS ===
Habits with auto_schedule: ${previewData.debug?.habitsWithAutoSchedule ?? 'N/A'}
Tasks with auto_schedule: ${previewData.debug?.tasksWithAutoSchedule ?? 'N/A'}
Existing calendar events: ${previewData.debug?.existingEventsCount ?? 'N/A'}

=== SCHEDULED EVENTS ===
${eventsLog || 'No events scheduled'}

=== TASK DETAILS ===
${taskDetailsLog}

=== SCHEDULING STEPS ===
${stepsLog || 'No steps recorded'}

=== WARNINGS ===
${previewData.warnings.length > 0 ? previewData.warnings.join('\n') : 'No warnings'}

=== TROUBLESHOOTING ===
If 0 events were scheduled:
1. Ensure tasks/habits have "auto_schedule" enabled
2. Verify tasks have "total_duration" > 0
3. Check calendar hour settings are configured for the correct days
4. Verify there are available time slots without conflicts
5. Check that tasks don't have start_date in the future beyond the scheduling window

Share this log with engineers for debugging assistance.
`;

    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-schedule-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Debug log downloaded');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-dynamic-blue" />
            Smart Schedule Preview
          </DialogTitle>
          <DialogDescription>
            Preview the scheduling results before applying them to your
            calendar.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">
              Generating preview...
            </p>
          </div>
        ) : previewData ? (
          <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="instant" className="gap-2">
                <Eye className="h-4 w-4" />
                Instant Preview
              </TabsTrigger>
              <TabsTrigger value="animated" className="gap-2">
                <Play className="h-4 w-4" />
                Animated Demo
              </TabsTrigger>
            </TabsList>

            <TabsContent value="instant" className="space-y-4">
              {previewData.summary.totalEvents === 0 ? (
                <EmptyPreviewState debug={previewData.debug} />
              ) : (
                <>
                  <PreviewSummary summary={previewData.summary} />
                  <PreviewWarnings
                    warnings={previewData.warnings}
                    taskDetails={previewData.tasks?.details}
                  />
                </>
              )}
            </TabsContent>

            <TabsContent value="animated" className="space-y-4">
              {/* Animation Controls */}
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={stepBackward}
                      disabled={currentStep === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={togglePlayPause}
                    >
                      {isPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={stepForward}
                      disabled={currentStep >= totalSteps - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Step {currentStep + 1} of {totalSteps}
                  </span>
                </div>

                <Progress
                  value={((currentStep + 1) / Math.max(totalSteps, 1)) * 100}
                  className="mt-3"
                />

                {/* Current Step Info */}
                {stepsWithEvents[currentStep] && (
                  <div className="mt-3 rounded-md bg-background p-3">
                    <p className="text-sm font-medium">
                      {stepsWithEvents[currentStep]?.description}
                    </p>
                    {stepsWithEvents[currentStep]?.event && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(
                          stepsWithEvents[currentStep]!.event!.start_at
                        ).toLocaleString()}{' '}
                        -{' '}
                        {new Date(
                          stepsWithEvents[currentStep]!.event!.end_at
                        ).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <PreviewSummary
                summary={previewData.summary}
                currentStep={currentStep}
                totalSteps={totalSteps}
              />
            </TabsContent>
          </Tabs>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <div className="flex flex-1 items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Preview events are shown on the calendar with a dashed border
            </span>
            {isDev && previewData && (
              <Button
                variant="ghost"
                size="sm"
                onClick={downloadFullDebugLog}
                className="ml-auto text-xs"
              >
                <Bug className="mr-1 h-3 w-3" />
                Debug Log
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDiscard}>
              <X className="mr-2 h-4 w-4" />
              Discard
            </Button>
            <Button onClick={handleApply} disabled={isApplying || isLoading}>
              {isApplying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Apply Schedule
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyPreviewState({ debug }: { debug?: PreviewData['debug'] }) {
  const isDev = process.env.NODE_ENV === 'development';

  const downloadDebugLog = () => {
    const logContent = `Smart Schedule Preview Debug Log
Generated: ${new Date().toISOString()}

=== Summary ===
Habits with auto_schedule enabled: ${debug?.habitsWithAutoSchedule ?? 'N/A'}
Tasks with auto_schedule enabled: ${debug?.tasksWithAutoSchedule ?? 'N/A'}
Existing calendar events: ${debug?.existingEventsCount ?? 'N/A'}

=== Analysis ===
${
  debug?.habitsWithAutoSchedule === 0 && debug?.tasksWithAutoSchedule === 0
    ? 'No habits or tasks have auto_schedule enabled. Enable auto_schedule on the items you want to automatically schedule.'
    : 'Items were found but could not be scheduled. Possible reasons:\n- All tasks are already fully scheduled\n- No available time slots in calendar hours\n- Time conflicts with existing events'
}

=== Troubleshooting ===
1. Check that tasks/habits have "auto_schedule" enabled
2. Verify tasks have "total_duration" set
3. Check calendar hour settings are configured
4. Ensure there are available time slots without conflicts
`;

    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-schedule-debug-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8">
      <Info className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium">No Events to Schedule</h3>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        {debug?.habitsWithAutoSchedule === 0 &&
        debug?.tasksWithAutoSchedule === 0
          ? 'No habits or tasks have auto-scheduling enabled. Enable auto_schedule on the items you want to schedule.'
          : 'All schedulable items are either already scheduled or cannot fit in available time slots.'}
      </p>

      {debug && (
        <div className="mt-4 grid grid-cols-3 gap-4 text-center text-xs">
          <div>
            <p className="font-medium">{debug.habitsWithAutoSchedule}</p>
            <p className="text-muted-foreground">Auto-schedule habits</p>
          </div>
          <div>
            <p className="font-medium">{debug.tasksWithAutoSchedule}</p>
            <p className="text-muted-foreground">Auto-schedule tasks</p>
          </div>
          <div>
            <p className="font-medium">{debug.existingEventsCount}</p>
            <p className="text-muted-foreground">Existing events</p>
          </div>
        </div>
      )}

      {isDev && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={downloadDebugLog}
        >
          <Bug className="mr-2 h-4 w-4" />
          Download Debug Log
        </Button>
      )}
    </div>
  );
}

function PreviewSummary({
  summary,
  currentStep,
  totalSteps,
}: {
  summary: PreviewData['summary'];
  currentStep?: number;
  totalSteps?: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
      <div className="text-center">
        <p className="text-2xl font-bold text-dynamic-blue">
          {summary.totalEvents}
        </p>
        <p className="text-xs text-muted-foreground">Total Events</p>
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold text-dynamic-green">
          {summary.habitsScheduled}
        </p>
        <p className="text-xs text-muted-foreground">Habits</p>
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold text-dynamic-purple">
          {summary.tasksScheduled}
        </p>
        <p className="text-xs text-muted-foreground">Tasks</p>
      </div>
      <div className="text-center">
        <p
          className={cn(
            'text-2xl font-bold',
            summary.partiallyScheduledTasks > 0
              ? 'text-dynamic-orange'
              : 'text-muted-foreground'
          )}
        >
          {summary.partiallyScheduledTasks}
        </p>
        <p className="text-xs text-muted-foreground">Partial</p>
      </div>
    </div>
  );
}

type TaskDetail = {
  taskId: string;
  taskName: string;
  scheduledMinutes: number;
  totalMinutesRequired: number;
  remainingMinutes: number;
  warning?: string;
  warningLevel?: 'info' | 'warning' | 'error';
};

function PreviewWarnings({
  warnings,
  taskDetails,
}: {
  warnings: string[];
  taskDetails?: TaskDetail[];
}) {
  if (warnings.length === 0 && (!taskDetails || taskDetails.length === 0)) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dynamic-green/30 bg-dynamic-green/10 p-4">
        <CheckCircle className="h-5 w-5 text-dynamic-green" />
        <span className="text-sm text-dynamic-green">
          All items can be fully scheduled!
        </span>
      </div>
    );
  }

  const errorTasks =
    taskDetails?.filter((t) => t.warningLevel === 'error') || [];
  const warningTasks =
    taskDetails?.filter((t) => t.warningLevel === 'warning') || [];

  return (
    <ScrollArea className="h-[200px]">
      <div className="space-y-2">
        {errorTasks.length > 0 && (
          <div className="rounded-lg border border-dynamic-red/30 bg-dynamic-red/10 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-dynamic-red" />
              <span className="text-sm font-medium text-dynamic-red">
                Could not schedule ({errorTasks.length})
              </span>
            </div>
            <ul className="mt-2 space-y-1">
              {errorTasks.map((task) => (
                <li key={task.taskId} className="text-xs text-muted-foreground">
                  {task.taskName}
                </li>
              ))}
            </ul>
          </div>
        )}

        {warningTasks.length > 0 && (
          <div className="rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/10 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-dynamic-orange" />
              <span className="text-sm font-medium text-dynamic-orange">
                Partially scheduled ({warningTasks.length})
              </span>
            </div>
            <ul className="mt-2 space-y-1">
              {warningTasks.map((task) => (
                <li key={task.taskId} className="text-xs text-muted-foreground">
                  {task.taskName}: {task.remainingMinutes}m remaining (
                  {Math.round(
                    (task.scheduledMinutes / task.totalMinutesRequired) * 100
                  )}
                  %)
                </li>
              ))}
            </ul>
          </div>
        )}

        {warnings.length > 0 &&
          errorTasks.length === 0 &&
          warningTasks.length === 0 && (
            <div className="rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/10 p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-dynamic-orange" />
                <span className="text-sm font-medium text-dynamic-orange">
                  Warnings ({warnings.length})
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {warnings.map((warning, index) => (
                  <li key={index} className="text-xs text-muted-foreground">
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}
      </div>
    </ScrollArea>
  );
}
