'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bug,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  X,
} from '@tuturuuu/icons';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Button } from '@tuturuuu/ui/button';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { Progress } from '@tuturuuu/ui/progress';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PreviewEvent } from '@/lib/calendar/unified-scheduler/preview-engine';

interface SmartSchedulePreviewPanelProps {
  wsId: string;
  isOpen: boolean;
  onClose: () => void;
  mode: 'instant' | 'animated';
}

interface SlotDebugInfo {
  start: string;
  end: string;
  maxAvailable: number;
  dayOfWeek: string;
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
    debug?: {
      slotsAvailable?: number;
      slotsConsidered?: SlotDebugInfo[];
      slotChosen?: SlotDebugInfo;
      reason?: string;
      remainingMinutes?: number;
      dayOffset?: number;
    };
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
  habits?: { total: number };
  debug?: {
    habitsWithAutoSchedule: number;
    tasksWithAutoSchedule: number;
    existingEventsCount: number;
    lockedEventsCount?: number;
    unlockedEventsCount?: number;
    hourSettings?: {
      working_hours?: { start: string; end: string } | null;
      personal_hours?: { start: string; end: string } | null;
      meeting_hours?: { start: string; end: string } | null;
    };
    configuredTimezone?: string;
    resolvedTimezone?: string;
    habitDetails?: Array<{
      id: string;
      name: string;
      frequency: string;
      duration_minutes: number;
      calendar_hours: string;
      priority: string;
      auto_schedule: boolean;
      is_visible_in_calendar: boolean;
      ideal_time?: string | null;
      time_preference?: string | null;
    }>;
    taskDetails?: Array<{
      id: string;
      name: string;
      total_duration: number;
      calendar_hours: string;
      priority: string;
      auto_schedule: boolean;
      is_splittable: boolean;
      start_date?: string | null;
      end_date?: string | null;
    }>;
    lockedEventsBlocking?: Array<{
      id: string;
      title: string;
      start_at: string;
      end_at: string;
    }>;
  };
}

export function SmartSchedulePreviewPanel({
  wsId,
  isOpen,
  onClose,
  mode: initialMode,
}: SmartSchedulePreviewPanelProps) {
  const {
    setPreviewEvents,
    clearPreviewEvents,
    clearAffectedEventIds,
    setHideNonPreviewEvents,
  } = useCalendar();
  const { refresh } = useCalendarSync();
  const queryClient = useQueryClient();

  const [isApplying, setIsApplying] = useState(false);
  const [mode, setMode] = useState<'instant' | 'animated'>(initialMode);

  // Animation state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [animationSpeed] = useState(600);
  const animationRef = useRef<NodeJS.Timeout | null>(null);

  const convertToCalendarEvents = useCallback(
    (events: PreviewEvent[]): CalendarEvent[] => {
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
    },
    []
  );

  const clientTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  }, []);

  const previewQuery = useQuery({
    queryKey: ['smart-schedule-preview', wsId, 30, clientTimezone],
    enabled: isOpen,
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/calendar/schedule/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ windowDays: 30, clientTimezone }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate preview');
      }

      return result as {
        preview: PreviewData;
        tasks?: PreviewData['tasks'];
        habits?: PreviewData['habits'];
        debug?: PreviewData['debug'];
      };
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const previewData: PreviewData | null = useMemo(() => {
    if (!previewQuery.data) return null;
    return {
      ...previewQuery.data.preview,
      tasks: previewQuery.data.tasks,
      habits: previewQuery.data.habits,
      debug: previewQuery.data.debug,
    };
  }, [previewQuery.data]);

  // Reset mode when panel opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);

  // Clear preview when panel closes
  useEffect(() => {
    if (!isOpen) {
      clearPreviewEvents();
      clearAffectedEventIds();
      setHideNonPreviewEvents(false);
      setCurrentStep(0);
      setIsPlaying(false);
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
      queryClient.removeQueries({ queryKey: ['smart-schedule-preview', wsId] });
    }
  }, [
    isOpen,
    clearPreviewEvents,
    clearAffectedEventIds,
    setHideNonPreviewEvents,
    queryClient,
    wsId,
  ]);

  // Close panel on preview errors
  useEffect(() => {
    if (!isOpen) return;
    if (!previewQuery.isError) return;
    toast.error(
      previewQuery.error instanceof Error
        ? previewQuery.error.message
        : 'Failed to generate preview'
    );
    onClose();
  }, [isOpen, previewQuery.isError, previewQuery.error, onClose]);

  // Update calendar preview events when mode/step changes
  useEffect(() => {
    if (!previewData) {
      clearAffectedEventIds();
      setHideNonPreviewEvents(false);
      return;
    }

    // Hide all non-preview events during preview for better UX and performance
    setHideNonPreviewEvents(true);

    if (mode === 'instant') {
      const calendarEvents = convertToCalendarEvents(previewData.events);
      setPreviewEvents(calendarEvents);
    } else {
      const stepsWithEvents = previewData.steps.filter((s) => s.event);
      const eventsUpToStep = stepsWithEvents
        .slice(0, currentStep + 1)
        .map((s) => s.event!)
        .filter(Boolean);
      const calendarEvents = convertToCalendarEvents(eventsUpToStep);
      setPreviewEvents(calendarEvents);
    }
  }, [
    previewData,
    mode,
    currentStep,
    setPreviewEvents,
    clearAffectedEventIds,
    setHideNonPreviewEvents,
    convertToCalendarEvents,
  ]);

  // Auto-start animation in animated mode once we have results
  useEffect(() => {
    if (!isOpen) return;
    if (initialMode !== 'animated') return;
    if (!previewData?.events?.length) return;
    setIsPlaying(true);
  }, [isOpen, initialMode, previewData?.events?.length]);

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
    }, animationSpeed);

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, [isPlaying, currentStep, mode, previewData, animationSpeed]);

  const handleApply = async () => {
    if (!previewData?.events.length) {
      toast.error('No events to apply');
      return;
    }

    setIsApplying(true);
    toast.loading('Applying schedule...', { id: 'apply-schedule' });

    try {
      // Send preview events directly to avoid regeneration mismatch
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/calendar/schedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            windowDays: 30,
            forceReschedule: true,
            // Pass preview events directly to create exact same schedule
            previewEvents: previewData.events,
            clientTimezone,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Scheduling failed');
      }

      // Clear all preview state FIRST before refreshing
      clearPreviewEvents();
      clearAffectedEventIds();
      setHideNonPreviewEvents(false);
      setCurrentStep(0);
      setIsPlaying(false);
      queryClient.removeQueries({ queryKey: ['smart-schedule-preview', wsId] });

      // Close panel immediately so user sees actual calendar
      onClose();

      // Then refresh to fetch actual data from database
      refresh();

      toast.success(
        `Scheduled ${result.summary.eventsTotal} events (${result.summary.eventsCreated} new, ${result.summary.eventsUpdated} updated)`,
        { id: 'apply-schedule' }
      );
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
    clearAffectedEventIds();
    setHideNonPreviewEvents(false);
    onClose();
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
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

  const resetAnimation = () => {
    setCurrentStep(0);
    setIsPlaying(false);
  };

  const downloadDebugLog = () => {
    if (!previewData) return;

    const eventsLog = previewData.events
      .map(
        (e, i) =>
          `${i + 1}. [${e.type}] "${e.title}" - ${new Date(e.start_at).toLocaleString()} to ${new Date(e.end_at).toLocaleTimeString()}`
      )
      .join('\n');

    const stepsLog = previewData.steps
      .map((s) => {
        let stepLine = `[Step ${s.step}] ${s.type}: ${s.action} - ${s.description}`;
        // Add debug context if available
        if (s.debug) {
          if (s.debug.slotsAvailable !== undefined) {
            stepLine += `\n      Slots available: ${s.debug.slotsAvailable}`;
          }
          if (s.debug.reason) {
            stepLine += `\n      Reason: ${s.debug.reason}`;
          }
          if (s.debug.slotChosen) {
            const slot = s.debug.slotChosen;
            stepLine += `\n      Slot chosen: ${slot.dayOfWeek} ${new Date(slot.start).toLocaleTimeString()}-${new Date(slot.end).toLocaleTimeString()} (${slot.maxAvailable}min avail)`;
          }
          if (s.debug.slotsConsidered && s.debug.slotsConsidered.length > 0) {
            stepLine += `\n      Slots considered: ${s.debug.slotsConsidered
              .map(
                (slot) =>
                  `${slot.dayOfWeek} ${new Date(slot.start).toLocaleTimeString()}-${new Date(slot.end).toLocaleTimeString()} (${slot.maxAvailable}min)`
              )
              .join(', ')}`;
          }
          if (s.debug.remainingMinutes !== undefined) {
            stepLine += `\n      Remaining after this: ${s.debug.remainingMinutes}min`;
          }
          if (s.debug.dayOffset !== undefined) {
            stepLine += `\n      Day offset: ${s.debug.dayOffset}`;
          }
        }
        return stepLine;
      })
      .join('\n\n');

    const scheduledTasksLog =
      previewData.tasks?.details
        ?.map(
          (t) =>
            `- "${t.taskName}" (ID: ${t.taskId}): ${t.scheduledMinutes}/${t.totalMinutesRequired} mins scheduled` +
            (t.remainingMinutes > 0
              ? ` (${t.remainingMinutes} mins remaining)`
              : '') +
            (t.warning
              ? ` [${t.warningLevel?.toUpperCase()}] ${t.warning}`
              : '')
        )
        .join('\n') || 'None';

    const hourSettings = previewData.debug?.hourSettings;
    const hourSettingsLog = hourSettings
      ? `Working Hours: ${hourSettings.working_hours?.start ?? 'Not set'} - ${hourSettings.working_hours?.end ?? 'Not set'}
Personal Hours: ${hourSettings.personal_hours?.start ?? 'Not set'} - ${hourSettings.personal_hours?.end ?? 'Not set'}
Meeting Hours: ${hourSettings.meeting_hours?.start ?? 'Not set'} - ${hourSettings.meeting_hours?.end ?? 'Not set'}`
      : 'Not configured (using defaults: 07:00-23:00)';

    // Format habit details
    const habitDetailsLog =
      previewData.debug?.habitDetails
        ?.map(
          (h) =>
            `- "${h.name}" (ID: ${h.id})
    Frequency: ${h.frequency}
    Duration: ${h.duration_minutes} mins
    Calendar: ${h.calendar_hours}
    Priority: ${h.priority}
    Auto-schedule: ${h.auto_schedule}
    Visible: ${h.is_visible_in_calendar}
    Ideal time: ${h.ideal_time || 'Any'}
    Time preference: ${h.time_preference || 'Any'}`
        )
        .join('\n\n') || 'None';

    // Format task details
    const taskDetailsLog =
      previewData.debug?.taskDetails
        ?.map(
          (t) =>
            `- "${t.name}" (ID: ${t.id})
    Duration: ${t.total_duration}h (${(t.total_duration * 60).toFixed(0)} mins)
    Calendar: ${t.calendar_hours}
    Priority: ${t.priority}
    Auto-schedule: ${t.auto_schedule}
    Splittable: ${t.is_splittable}
    Start date: ${t.start_date || 'Not set'}
    End date: ${t.end_date || 'Not set'}`
        )
        .join('\n\n') || 'None';

    const logContent = `Smart Schedule Preview Debug Log
Generated: ${new Date().toISOString()}
Workspace: ${wsId}

=== SUMMARY ===
Total Events: ${previewData.summary.totalEvents}
Habits: ${previewData.summary.habitsScheduled}
Tasks: ${previewData.summary.tasksScheduled}
Partial: ${previewData.summary.partiallyScheduledTasks}
Unscheduled: ${previewData.summary.unscheduledTasks}

=== CONFIGURATION ===
Configured Timezone: ${previewData.debug?.configuredTimezone ?? 'auto'}
Resolved Timezone: ${previewData.debug?.resolvedTimezone ?? 'Unknown'}
${hourSettingsLog}

=== INPUT COUNTS ===
Auto-schedule habits: ${previewData.debug?.habitsWithAutoSchedule ?? 'N/A'}
Auto-schedule tasks: ${previewData.debug?.tasksWithAutoSchedule ?? 'N/A'}
Existing events: ${previewData.debug?.existingEventsCount ?? 'N/A'}
  - Locked: ${previewData.debug?.lockedEventsCount ?? 'N/A'}
  - Unlocked: ${previewData.debug?.unlockedEventsCount ?? 'N/A'}

=== LOCKED EVENTS (Blocking) ===
${
  previewData.debug?.lockedEventsBlocking
    ?.map(
      (e) =>
        `- "${e.title}" (${e.id.substring(0, 8)}...): ${new Date(e.start_at).toLocaleString()} to ${new Date(e.end_at).toLocaleTimeString()}`
    )
    .join('\n') || 'None (scheduling has full freedom)'
}

=== HABIT DETAILS (Input) ===
${habitDetailsLog}

=== TASK DETAILS (Input) ===
${taskDetailsLog}

=== SCHEDULING RESULTS ===
${scheduledTasksLog}

=== EVENTS CREATED ===
${eventsLog || 'None'}

=== STEPS ===
${stepsLog || 'None'}

=== WARNINGS ===
${previewData.warnings.join('\n') || 'None'}
`;

    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule-debug-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Debug log downloaded');
  };

  const stepsWithEvents = previewData?.steps.filter((s) => s.event) || [];
  const totalSteps = stepsWithEvents.length;
  const currentStepData = stepsWithEvents[currentStep];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'fixed z-50 rounded-xl border bg-background/95 shadow-2xl backdrop-blur-sm',
          // Responsive positioning
          'right-4 bottom-4 left-4 sm:right-6 sm:bottom-6 sm:left-auto',
          'sm:w-[380px] sm:max-w-[calc(100vw-3rem)]'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-dynamic-blue" />
            <span className="font-medium">Smart Schedule</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleDiscard}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4">
          {previewQuery.isFetching ? (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-3 text-muted-foreground text-sm">
                Analyzing calendar...
              </p>
            </div>
          ) : previewData ? (
            <div className="space-y-4">
              {/* Mode Toggle */}
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('instant');
                    setIsPlaying(false);
                  }}
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 font-medium text-sm transition-colors',
                    mode === 'instant'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Instant
                </button>
                <button
                  type="button"
                  onClick={() => setMode('animated')}
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 font-medium text-sm transition-colors',
                    mode === 'animated'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Animated
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="font-bold text-dynamic-blue text-lg">
                    {previewData.summary.totalEvents}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Events</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="font-bold text-dynamic-green text-lg">
                    {previewData.summary.habitsScheduled}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Habits</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="font-bold text-dynamic-purple text-lg">
                    {previewData.summary.tasksScheduled}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Tasks</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p
                    className={cn(
                      'font-bold text-lg',
                      previewData.summary.partiallyScheduledTasks > 0
                        ? 'text-dynamic-orange'
                        : 'text-muted-foreground'
                    )}
                  >
                    {previewData.summary.partiallyScheduledTasks}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Partial</p>
                </div>
              </div>

              {/* Empty State */}
              {previewData.summary.totalEvents === 0 && (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <Info className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 font-medium text-sm">
                    No events to schedule
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {previewData.debug?.habitsWithAutoSchedule === 0 &&
                    previewData.debug?.tasksWithAutoSchedule === 0
                      ? 'Enable auto-schedule on tasks or habits'
                      : 'All items are already scheduled'}
                  </p>
                </div>
              )}

              {/* Animation Controls */}
              {mode === 'animated' && totalSteps > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={resetAnimation}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={stepBackward}
                        disabled={currentStep === 0}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="default"
                        size="icon"
                        className="h-8 w-8"
                        onClick={togglePlayPause}
                      >
                        {isPlaying ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={stepForward}
                        disabled={currentStep >= totalSteps - 1}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {currentStep + 1} / {totalSteps}
                    </span>
                  </div>

                  <Progress
                    value={((currentStep + 1) / Math.max(totalSteps, 1)) * 100}
                    className="h-1.5"
                  />

                  {/* Current Step Info */}
                  {currentStepData && (
                    <motion.div
                      key={currentStep}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="rounded-lg bg-muted/50 p-3"
                    >
                      <p className="line-clamp-2 font-medium text-sm">
                        {currentStepData.description}
                      </p>
                      {currentStepData.event && (
                        <p className="mt-1 text-muted-foreground text-xs">
                          {new Date(
                            currentStepData.event.start_at
                          ).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {' - '}
                          {new Date(
                            currentStepData.event.end_at
                          ).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      )}
                    </motion.div>
                  )}
                </div>
              )}

              {/* Warnings */}
              {previewData.warnings.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-dynamic-orange/10 p-3 text-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-dynamic-orange" />
                  <div>
                    <p className="font-medium text-dynamic-orange">
                      {previewData.warnings.length} warning(s)
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-muted-foreground">
                      {previewData.warnings[0]}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {previewData && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={downloadDebugLog}
            >
              <Bug className="mr-1 h-3 w-3" />
              Debug
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={handleDiscard}
              >
                Discard
              </Button>
              <Button
                size="sm"
                className="h-8"
                onClick={handleApply}
                disabled={
                  isApplying ||
                  previewQuery.isFetching ||
                  previewData.summary.totalEvents === 0
                }
              >
                {isApplying ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                )}
                Apply
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
