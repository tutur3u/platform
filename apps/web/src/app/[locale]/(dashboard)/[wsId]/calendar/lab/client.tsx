'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bug,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from '@tuturuuu/icons';
import type {
  CalendarConnection,
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Button } from '@tuturuuu/ui/button';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@tuturuuu/ui/resizable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import dayjs from 'dayjs';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generatePreview } from '@/lib/calendar/unified-scheduler/preview-engine';
import { useCalendarSettings } from '../hooks';
import { HeatmapOverlay } from './components/heatmap-overlay';
import { generateRealisticScenario } from './generator';
import { PRESET_SCENARIOS } from './scenarios';
import type { CalendarScenario } from './types';

interface CalendarLabClientPageProps {
  workspace: Workspace;
  googleToken?: WorkspaceCalendarGoogleToken | null;
  calendarConnections: CalendarConnection[];
}

export default function CalendarLabClientPage({
  workspace,
  googleToken,
  calendarConnections,
}: CalendarLabClientPageProps) {
  const t = useTranslations('calendar');
  const locale = useLocale();
  const { setPreviewEvents, clearPreviewEvents, hoveredBaseEventId } =
    useCalendar();
  const { dates } = useCalendarSync();

  const { initialSettings } = useCalendarSettings(workspace, locale);

  // Simulation state
  const [currentScenario, setCurrentScenario] = useState<CalendarScenario | null>(
    null
  );
  const [isSimulating, setIsSimulating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [simulationResult, setSimulationResult] = useState<any>(null);

  // Visualization state
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);

  const animationRef = useRef<NodeJS.Timeout | null>(null);

  const clientTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  }, []);

  const importRealData = async () => {
    setIsImporting(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspace.id}/calendar/schedule/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ windowDays: 30, clientTimezone }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to import data');
      }

      // Convert the result into a scenario format
      const scenario: CalendarScenario = {
        id: 'real-data',
        name: 'Real Workspace Data',
        description:
          'Currently active tasks, habits, and events from this workspace.',
        tasks: result.debug?.taskDetails || [],
        habits: result.debug?.habitDetails || [],
        events: result.lockedEvents || [],
        settings: {
          hours: {
            workHours: result.debug?.hourSettings?.workHours || {},
            personalHours: result.debug?.hourSettings?.personalHours || {},
            meetingHours: result.debug?.hourSettings?.meetingHours || {},
          } as any,
          timezone: result.debug?.resolvedTimezone || clientTimezone,
        },
      };

      setCurrentScenario(scenario);
      setSimulationResult(result);
      setCurrentStep(result.preview.steps.length - 1); // Default to final state
      setIsPlaying(false);
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setIsImporting(false);
    }
  };

  const loadPresetScenario = (scenarioId: string) => {
    const scenario = PRESET_SCENARIOS.find((s) => s.id === scenarioId);
    if (scenario) {
      setCurrentScenario(scenario);
      setSimulationResult(null);
      setCurrentStep(0);
      setIsPlaying(false);
      clearPreviewEvents();
      setSelectedItemId(null);
    }
  };

  const generateRandom = () => {
    const scenario = generateRealisticScenario({
      taskCount: 15,
      habitCount: 8,
    });
    setCurrentScenario(scenario);
    setSimulationResult(null);
    setCurrentStep(0);
    setIsPlaying(false);
    clearPreviewEvents();
    setSelectedItemId(null);
  };

  const runSimulation = async () => {
    if (!currentScenario) return;
    setIsSimulating(true);
    try {
      // Run the simulation entirely client-side
      const result = generatePreview(
        currentScenario.habits,
        currentScenario.tasks,
        currentScenario.events,
        currentScenario.settings.hours as any,
        {
          windowDays: 30,
          timezone: currentScenario.settings.timezone,
        }
      );

      setSimulationResult({ preview: result });
      setCurrentStep(result.steps.length - 1);
      setIsPlaying(false);
    } catch (error) {
      console.error('Simulation failed:', error);
    } finally {
      setIsSimulating(false);
    }
  };

  const convertToCalendarEvents = useCallback(
    (events: any[]): CalendarEvent[] => {
      return events.map((e) => {
        const taskResult = simulationResult?.preview?.tasks?.events?.find(
          (tr: any) => tr.task.id === e.source_id
        );
        const habitResult = simulationResult?.preview?.habits?.events?.find(
          (hr: any) => hr.habit.id === e.source_id
        );

        return {
          id: e.id,
          title: e.title,
          start_at: e.start_at,
          end_at: e.end_at,
          color: e.color as any,
          _isPreview: true,
          _warning: taskResult?.warning || habitResult?.warning,
        };
      });
    },
    [simulationResult]
  );

  useEffect(() => {
    if (!simulationResult) {
      clearPreviewEvents();
      return;
    }

    const stepsWithEvents = simulationResult.preview.steps.filter(
      (s: any) => s.event
    );
    const eventsUpToStep = stepsWithEvents
      .slice(0, currentStep + 1)
      .map((s: any) => s.event!)
      .filter(Boolean);

    setPreviewEvents(convertToCalendarEvents(eventsUpToStep));
  }, [
    simulationResult,
    currentStep,
    setPreviewEvents,
    clearPreviewEvents,
    convertToCalendarEvents,
  ]);

  // Handle animation
  useEffect(() => {
    if (isPlaying && simulationResult) {
      const stepsWithEvents = simulationResult.preview.steps.filter(
        (s: any) => s.event
      );
      if (currentStep < stepsWithEvents.length - 1) {
        animationRef.current = setTimeout(() => {
          setCurrentStep((prev) => prev + 1);
        }, 600);
      } else {
        setIsPlaying(false);
      }
    } else if (animationRef.current) {
      clearTimeout(animationRef.current);
    }

    return () => {
      if (animationRef.current) clearTimeout(animationRef.current);
    };
  }, [isPlaying, currentStep, simulationResult]);

  const playbackStepsWithEvents = useMemo(() => {
    if (!simulationResult) return [];
    return simulationResult.preview.steps.filter((s: any) => s.event);
  }, [simulationResult]);

  const allItems = useMemo(() => {
    if (!currentScenario) return [];
    return [
      ...currentScenario.habits.map((h) => ({
        id: h.id,
        name: h.name,
        type: 'habit',
      })),
      ...currentScenario.tasks.map((t) => ({
        id: t.id,
        name: t.name,
        type: 'task',
      })),
    ];
  }, [currentScenario]);

  const hoveredStep = useMemo(() => {
    if (!simulationResult || !hoveredBaseEventId) return null;
    return simulationResult.preview.steps.find(
      (s: any) => s.event?.id === hoveredBaseEventId
    );
  }, [simulationResult, hoveredBaseEventId]);

  return (
    <ResizablePanelGroup direction="horizontal" className="flex-1">
      <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
        <div className="flex h-full flex-col border-r bg-card scrollbar-none overflow-y-auto">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Bug className="h-5 w-5" />
              Lab Controls
            </h2>
          </div>

          <Tabs defaultValue="scenarios" className="flex-1 flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-4">
              <TabsTrigger
                value="scenarios"
                className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Scenarios
              </TabsTrigger>
              <TabsTrigger
                value="summary"
                className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Summary
              </TabsTrigger>
              <TabsTrigger
                value="log"
                className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Decision Log
              </TabsTrigger>
            </TabsList>

            <TabsContent value="scenarios" className="flex-1 p-4 space-y-6">
              <section className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Data Sourcing
                </h3>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    onClick={importRealData}
                    disabled={isImporting}
                    className="w-full justify-start"
                  >
                    {isImporting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-2 h-4 w-4" />
                    )}
                    Import Workspace
                  </Button>

                  <Button
                    variant="outline"
                    onClick={generateRandom}
                    className="w-full justify-start"
                  >
                    <Sparkles className="mr-2 h-4 w-4 text-purple-500" />
                    Generate Random
                  </Button>
                </div>

                <Select
                  onValueChange={loadPresetScenario}
                  value={currentScenario?.id || ''}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a preset..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESET_SCENARIOS.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {currentScenario && (
                  <div className="rounded-md bg-muted p-3">
                    <div className="text-sm font-medium">
                      {currentScenario.name}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {currentScenario.description}
                    </div>
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Visualization
                </h3>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Score Heatmap</span>
                    <Switch
                      checked={showHeatmap}
                      onCheckedChange={setShowHeatmap}
                      disabled={!currentScenario || !selectedItemId}
                    />
                  </div>

                  <Select
                    onValueChange={setSelectedItemId}
                    value={selectedItemId || ''}
                    disabled={!currentScenario}
                  >
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue placeholder="Select item to score..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          <span className="flex items-center gap-2">
                            <span
                              className={
                                item.type === 'habit'
                                  ? 'text-blue-500'
                                  : 'text-orange-500'
                              }
                            >
                              {item.type === 'habit' ? 'H' : 'T'}
                            </span>
                            {item.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Execution
                </h3>
                <Button
                  onClick={runSimulation}
                  disabled={isSimulating || !currentScenario}
                  className="w-full"
                >
                  {isSimulating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  Run Simulation
                </Button>

                {simulationResult && (
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCurrentStep(0)}
                        disabled={currentStep === 0}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          setCurrentStep((prev) => Math.max(0, prev - 1))
                        }
                        disabled={currentStep === 0}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setIsPlaying(!isPlaying)}
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
                        onClick={() => setCurrentStep((prev) => prev + 1)}
                        disabled={
                          !simulationResult ||
                          currentStep >= playbackStepsWithEvents.length - 1
                        }
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="text-center text-xs text-muted-foreground">
                      Step {currentStep + 1} of {playbackStepsWithEvents.length}
                    </div>
                  </div>
                )}
              </section>
            </TabsContent>

            <TabsContent
              value="summary"
              className="flex flex-1 flex-col p-4 space-y-4"
            >
              {simulationResult ? (
                <div className="space-y-6">
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold uppercase text-muted-foreground">
                      Stats
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded bg-muted p-2 text-center">
                        <div className="text-xl font-bold">
                          {simulationResult.preview.summary.tasksScheduled}
                        </div>
                        <div className="text-[10px] uppercase text-muted-foreground">
                          Tasks
                        </div>
                      </div>
                      <div className="rounded bg-muted p-2 text-center">
                        <div className="text-xl font-bold">
                          {simulationResult.preview.summary.habitsScheduled}
                        </div>
                        <div className="text-[10px] uppercase text-muted-foreground">
                          Habits
                        </div>
                      </div>
                    </div>
                  </section>

                  {simulationResult.preview.warnings.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="flex items-center gap-1 text-xs font-bold uppercase text-muted-foreground">
                        <AlertTriangle className="h-3 w-3 text-red-500" />
                        Warnings
                      </h3>
                      <div className="space-y-1">
                        {simulationResult.preview.warnings.map(
                          (w: string, i: number) => (
                            <div
                              key={i}
                              className="rounded border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400"
                            >
                              {w}
                            </div>
                          )
                        )}
                      </div>
                    </section>
                  )}
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center space-y-2 p-8 text-center opacity-50">
                  <Sparkles className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Run a simulation to see the results summary.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent
              value="log"
              className="flex flex-1 flex-col p-4 space-y-4"
            >
              {hoveredStep ? (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200 space-y-4">
                  <div className="rounded-md border bg-accent p-3">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent-foreground/70">
                      Hovered Decision
                    </h3>
                    <div className="mb-1 text-sm font-medium">
                      {hoveredStep.description}
                    </div>
                    <div className="mb-3 text-xs italic text-muted-foreground">
                      "{hoveredStep.debug?.reason ||
                        'No specific reason provided.'}"
                    </div>

                    {hoveredStep.debug?.slotsConsidered && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1 text-[10px] font-bold uppercase">
                          <Info className="h-3 w-3" />
                          Slots Considered
                        </div>
                        <div className="space-y-1">
                          {hoveredStep.debug.slotsConsidered
                            .slice(0, 5)
                            .map((slot: any, i: number) => (
                              <div
                                key={i}
                                className="flex items-center justify-between rounded bg-background/50 px-2 py-1 text-[10px]"
                              >
                                <span>{dayjs(slot.start).format('HH:mm')}</span>
                                <span className="font-mono text-muted-foreground">
                                  {Math.round(slot.maxAvailable)}m available
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center space-y-2 p-8 text-center opacity-50">
                  <Bug className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Hover over a scheduled event to see the algorithm's
                    placement logic.
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel defaultSize={80}>
        <SmartCalendar
          t={t}
          locale={locale}
          workspace={workspace}
          useQuery={useQuery}
          useQueryClient={useQueryClient}
          experimentalGoogleToken={googleToken}
          initialSettings={initialSettings}
          disabled={true}
          overlay={
            showHeatmap && currentScenario && selectedItemId ? (
              <HeatmapOverlay
                scenario={currentScenario}
                selectedItemId={selectedItemId}
                dates={dates}
              />
            ) : null
          }
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}