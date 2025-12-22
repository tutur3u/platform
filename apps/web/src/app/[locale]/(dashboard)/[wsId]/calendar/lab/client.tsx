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
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCalendarSettings } from '../hooks';

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

  // Animation state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [simulationData, setSimulationData] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const animationRef = useRef<NodeJS.Timeout | null>(null);

  const clientTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  }, []);

  const runSimulation = async () => {
    setIsSimulating(true);
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
        throw new Error(result.error || 'Failed to generate simulation');
      }

      setSimulationData(result);
      setCurrentStep(0);
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
    if (!simulationData) {
      clearPreviewEvents();
      return;
    }

    const stepsWithEvents = simulationData.preview.steps.filter(
      (s: any) => s.event
    );
    const eventsUpToStep = stepsWithEvents
      .slice(0, currentStep + 1)
      .map((s: any) => s.event!)
      .filter(Boolean);

    setPreviewEvents(convertToCalendarEvents(eventsUpToStep));
  }, [
    simulationData,
    currentStep,
    setPreviewEvents,
    clearPreviewEvents,
    convertToCalendarEvents,
  ]);

  // Handle animation
  useEffect(() => {
    if (isPlaying && simulationData) {
      const stepsWithEvents = simulationData.preview.steps.filter(
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
  }, [isPlaying, currentStep, simulationData]);

  const playbackStepsWithEvents = useMemo(() => {
    if (!simulationData) return [];
    return simulationData.preview.steps.filter((s: any) => s.event);
  }, [simulationData]);

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
            <section>
              <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Simulation
              </h3>
              <Button
                onClick={runSimulation}
                disabled={isSimulating}
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

            {simulationData && (
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
                      !simulationData ||
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
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}