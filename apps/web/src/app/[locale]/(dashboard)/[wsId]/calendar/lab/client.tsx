'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bug,
  ChevronLeft,
  ChevronRight,
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
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generatePreview } from '@/lib/calendar/unified-scheduler/preview-engine';
import { useCalendarSettings } from '../hooks';
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
  const { setPreviewEvents, clearPreviewEvents } = useCalendar();

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
    }
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
      return events.map((e) => ({
        id: e.id,
        title: e.title,
        start_at: e.start_at,
        end_at: e.end_at,
        color: e.color as any,
        _isPreview: true,
      }));
    },
    []
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

  return (
    <ResizablePanelGroup direction="horizontal" className="flex-1">
      <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
        <div className="flex h-full flex-col border-r bg-card p-4">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Bug className="h-5 w-5" />
              Lab Controls
            </h2>
          </div>

          <div className="space-y-6">
            <section className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Scenarios
              </h3>
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

            <section>
              <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Simulation
              </h3>
              <Button
                onClick={runSimulation}
                disabled={isSimulating || !currentScenario}
                className="w-full"
              >
                {isSimulating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Run Simulation
              </Button>
            </section>

            {simulationResult && (
              <section className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Playback
                </h3>
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
                <div className="text-xs text-center text-muted-foreground">
                  Step {currentStep + 1} of {playbackStepsWithEvents.length}
                </div>
              </section>
            )}
          </div>
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
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}