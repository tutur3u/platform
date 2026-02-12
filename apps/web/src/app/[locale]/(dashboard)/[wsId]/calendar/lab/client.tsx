'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SchedulingWeights } from '@tuturuuu/ai/scheduling';
import {
  AlertTriangle,
  Bug,
  ChevronLeft,
  ChevronRight,
  Copy,
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
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Slider } from '@tuturuuu/ui/slider';
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
}: CalendarLabClientPageProps) {
  const t = useTranslations('calendar_lab');
  const tCalendar = useTranslations('calendar');
  const locale = useLocale();
  const { setPreviewEvents, clearPreviewEvents, hoveredBaseEventId } =
    useCalendar();
  const { dates } = useCalendarSync();

  const { initialSettings } = useCalendarSettings(workspace, locale);

  // Simulation state
  const [currentScenario, setCurrentScenario] =
    useState<CalendarScenario | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [baselineResult, setBaselineResult] = useState<any>(null);

  // Visualization state
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  // Tuning state
  const [weights, setWeights] = useState<SchedulingWeights>({
    habitIdealTimeBonus: 1000,
    habitPreferenceBonus: 500,
    taskPreferenceBonus: 500,
    taskBaseEarlyBonus: 300,
  });

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
      setBaselineResult(null);
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
    setBaselineResult(null);
    setCurrentStep(0);
    setIsPlaying(false);
    clearPreviewEvents();
    setSelectedItemId(null);
  };

  const saveAsBaseline = () => {
    setBaselineResult(simulationResult);
  };

  const runSimulation = async () => {
    if (!currentScenario) return;
    setIsSimulating(true);
    try {
      // Run the simulation entirely client-side with tunable weights
      const result = generatePreview(
        currentScenario.habits,
        currentScenario.tasks,
        currentScenario.events,
        currentScenario.settings.hours as any,
        {
          windowDays: 30,
          timezone: currentScenario.settings.timezone,
          weights,
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
      const baselineEvents = baselineResult?.preview?.events || [];
      const baselineMap = new Map<string, any>(
        baselineEvents.map((e: any) => [e.source_id, e])
      );

      return events.map((e) => {
        const taskResult = simulationResult?.preview?.tasks?.events?.find(
          (tr: any) => tr.task.id === e.source_id
        );
        const habitResult = simulationResult?.preview?.habits?.events?.find(
          (hr: any) => hr.habit.id === e.source_id
        );

        let finalColor = e.color as any;
        let finalTitle = e.title;

        if (showDiff && baselineResult) {
          const baseline = baselineMap.get(e.source_id);
          if (baseline) {
            const hasMoved =
              baseline.start_at !== e.start_at || baseline.end_at !== e.end_at;
            if (hasMoved) {
              finalColor = 'ORANGE';
              finalTitle = `[MOVED] ${e.title}`;
            }
          } else {
            finalColor = 'GREEN';
            finalTitle = `[NEW] ${e.title}`;
          }
        }

        return {
          id: e.id,
          title: finalTitle,
          start_at: e.start_at,
          end_at: e.end_at,
          color: finalColor,
          _isPreview: true,
          _warning: taskResult?.warning || habitResult?.warning,
        };
      });
    },
    [simulationResult, baselineResult, showDiff]
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
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="scrollbar-none overflow-y-auto border-b bg-card">
        <div className="border-b p-4">
          <h2 className="flex items-center gap-2 font-semibold text-lg">
            <Bug className="h-5 w-5" />
            {t('controls')}
          </h2>
        </div>

        <Tabs defaultValue="scenarios" className="flex flex-1 flex-col">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-4">
            <TabsTrigger
              value="scenarios"
              className="rounded-none data-[state=active]:border-primary data-[state=active]:border-b-2 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              {t('scenarios')}
            </TabsTrigger>
            <TabsTrigger
              value="tuning"
              className="rounded-none data-[state=active]:border-primary data-[state=active]:border-b-2 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              {t('tuning')}
            </TabsTrigger>
            <TabsTrigger
              value="summary"
              className="rounded-none data-[state=active]:border-primary data-[state=active]:border-b-2 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              {t('summary')}
            </TabsTrigger>
            <TabsTrigger
              value="log"
              className="rounded-none data-[state=active]:border-primary data-[state=active]:border-b-2 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              {t('log')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scenarios" className="flex-1 space-y-6 p-4">
            <div className="space-y-4">
              <section className="space-y-3">
                <h3 className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                  {t('data_source')}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={importRealData}
                    disabled={isImporting}
                    className="h-20 flex-col gap-2"
                  >
                    {isImporting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-5 w-5 text-blue-500" />
                    )}
                    <span className="text-[10px]">{t('import_workspace')}</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateRandom}
                    className="h-20 flex-col gap-2"
                  >
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    <span className="text-[10px]">{t('randomize')}</span>
                  </Button>
                </div>

                <Select
                  onValueChange={loadPresetScenario}
                  value={currentScenario?.id || ''}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('select_preset')} />
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
                  <Card className="border-none bg-muted/50 shadow-none">
                    <CardHeader className="p-3 pb-0">
                      <CardTitle className="text-sm">
                        {currentScenario.name}
                      </CardTitle>
                      <CardDescription className="text-[10px] leading-tight">
                        {currentScenario.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex gap-2 p-3 pt-2">
                      <Badge
                        variant="secondary"
                        className="h-4 px-1 text-[9px]"
                      >
                        {currentScenario.tasks.length} {t('tasks')}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="h-4 px-1 text-[9px]"
                      >
                        {currentScenario.habits.length} {t('habits')}
                      </Badge>
                    </CardContent>
                  </Card>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                  {t('visualization')}
                </h3>

                <div className="space-y-4 px-1">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">
                        {t('heatmap')}
                      </span>
                      <span className="text-[10px] text-muted-foreground italic">
                        {t('heatmap_description')}
                      </span>
                    </div>
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
                      <SelectValue placeholder={t('select_item_to_score')} />
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

              <section className="space-y-3 pt-2">
                <Button
                  onClick={runSimulation}
                  disabled={isSimulating || !currentScenario}
                  className="w-full py-6 shadow-md"
                >
                  {isSimulating ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-5 w-5 fill-current" />
                  )}
                  {t('run_algorithm')}
                </Button>

                {simulationResult && (
                  <div className="space-y-4 rounded-lg border bg-accent/30 p-3 pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setCurrentStep(0)}
                        disabled={currentStep === 0}
                        className="h-8 w-8"
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
                        className="h-8 w-8"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="h-10 w-10 shadow-sm"
                      >
                        {isPlaying ? (
                          <Pause className="h-5 w-5 fill-current" />
                        ) : (
                          <Play className="h-5 w-5 fill-current" />
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
                        className="h-8 w-8"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="text-center font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                      Step {currentStep + 1} / {playbackStepsWithEvents.length}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </TabsContent>

          <TabsContent value="tuning" className="flex-1 space-y-6 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                {t('tuning')}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setWeights({
                    habitIdealTimeBonus: 1000,
                    habitPreferenceBonus: 500,
                    taskPreferenceBonus: 500,
                    taskBaseEarlyBonus: 300,
                  })
                }
                className="h-8 text-[10px] text-muted-foreground hover:text-foreground"
              >
                {t('reset')}
              </Button>
            </div>

            <div className="space-y-8 px-1">
              <div className="space-y-4">
                <div className="flex justify-between">
                  <label className="font-semibold text-[11px]">
                    {t('habit_ideal_time')}
                  </label>
                  <span className="font-mono text-[11px] text-primary">
                    {weights.habitIdealTimeBonus}
                  </span>
                </div>
                <Slider
                  value={[weights.habitIdealTimeBonus || 0]}
                  onValueChange={([val]) =>
                    setWeights((prev) => ({
                      ...prev,
                      habitIdealTimeBonus: val,
                    }))
                  }
                  max={2000}
                  step={50}
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between">
                  <label className="font-semibold text-[11px]">
                    {t('habit_preference')}
                  </label>
                  <span className="font-mono text-[11px] text-primary">
                    {weights.habitPreferenceBonus}
                  </span>
                </div>
                <Slider
                  value={[weights.habitPreferenceBonus || 0]}
                  onValueChange={([val]) =>
                    setWeights((prev) => ({
                      ...prev,
                      habitPreferenceBonus: val,
                    }))
                  }
                  max={1000}
                  step={50}
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between">
                  <label className="font-semibold text-[11px]">
                    {t('task_preference')}
                  </label>
                  <span className="font-mono text-[11px] text-primary">
                    {weights.taskPreferenceBonus}
                  </span>
                </div>
                <Slider
                  value={[weights.taskPreferenceBonus || 0]}
                  onValueChange={([val]) =>
                    setWeights((prev) => ({
                      ...prev,
                      taskPreferenceBonus: val,
                    }))
                  }
                  max={1000}
                  step={50}
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between">
                  <label className="font-semibold text-[11px]">
                    {t('task_base_urgency')}
                  </label>
                  <span className="font-mono text-[11px] text-primary">
                    {weights.taskBaseEarlyBonus}
                  </span>
                </div>
                <Slider
                  value={[weights.taskBaseEarlyBonus || 0]}
                  onValueChange={([val]) =>
                    setWeights((prev) => ({
                      ...prev,
                      taskBaseEarlyBonus: val,
                    }))
                  }
                  max={1000}
                  step={50}
                />
              </div>
            </div>

            <div className="space-y-3 border-t pt-6">
              <h3 className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                {t('diff_mode')}
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">
                      {t('diff_mode')}
                    </span>
                    <span className="text-[10px] text-muted-foreground italic">
                      {t('highlight_changes')}
                    </span>
                  </div>
                  <Switch
                    checked={showDiff}
                    onCheckedChange={setShowDiff}
                    disabled={!baselineResult || !simulationResult}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={saveAsBaseline}
                  disabled={!simulationResult}
                  className="h-10 w-full justify-start"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {t('set_baseline')}
                </Button>
                {baselineResult && (
                  <div className="flex items-center gap-2 rounded border border-blue-500/10 bg-blue-500/5 p-2 text-[10px] text-blue-600 italic leading-tight dark:text-blue-400">
                    <Info className="h-3 w-3 shrink-0" />
                    {t('baseline_captured')}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="summary"
            className="flex flex-1 flex-col space-y-4 p-4"
          >
            {simulationResult ? (
              <div className="space-y-6">
                <section className="space-y-2">
                  <h3 className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                    {t('stats')}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border bg-accent/50 p-3 text-center">
                      <div className="font-bold text-2xl">
                        {simulationResult.preview.summary.tasksScheduled}
                      </div>
                      <div className="font-semibold text-[10px] text-muted-foreground uppercase">
                        {t('tasks')}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-accent/50 p-3 text-center">
                      <div className="font-bold text-2xl">
                        {simulationResult.preview.summary.habitsScheduled}
                      </div>
                      <div className="font-semibold text-[10px] text-muted-foreground uppercase">
                        {t('habits')}
                      </div>
                    </div>
                  </div>
                </section>

                {simulationResult.preview.warnings.length > 0 && (
                  <section className="space-y-3">
                    <h3 className="flex items-center gap-1 font-bold text-muted-foreground text-xs uppercase tracking-wider">
                      <AlertTriangle className="h-3 w-3 text-red-500" />
                      {t('violations')}
                    </h3>
                    <div className="space-y-2">
                      {simulationResult.preview.warnings.map(
                        (w: string, i: number) => (
                          <div
                            key={i}
                            className="rounded-md border border-red-500/20 bg-red-500/5 p-2 text-[11px] text-red-600 leading-tight dark:text-red-400"
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
                <p className="font-medium text-muted-foreground text-sm">
                  {t('no_results')}
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="log"
            className="flex flex-1 flex-col space-y-4 p-4"
          >
            {hoveredStep ? (
              <div className="fade-in slide-in-from-top-1 animate-in space-y-4 duration-200">
                <Card className="border bg-accent/30 shadow-none">
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className="text-muted-foreground text-xs uppercase tracking-widest">
                      {t('decision_context')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 p-3 pt-0">
                    <div className="font-semibold text-sm leading-snug">
                      {hoveredStep.description}
                    </div>
                    <div className="rounded border bg-background/50 p-2 text-muted-foreground text-xs italic leading-relaxed">
                      "
                      {hoveredStep.debug?.reason ||
                        'No specific reason provided.'}
                      "
                    </div>

                    {hoveredStep.debug?.slotsConsidered && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1 font-bold text-[10px] text-muted-foreground uppercase">
                          <Info className="h-3 w-3" />
                          {t('slots_considered')}
                        </div>
                        <div className="space-y-1">
                          {hoveredStep.debug.slotsConsidered
                            .slice(0, 5)
                            .map((slot: any, i: number) => (
                              <div
                                key={i}
                                className="flex items-center justify-between rounded border border-transparent bg-background/50 px-2 py-1.5 text-[10px] transition-colors hover:border-primary/20"
                              >
                                <span className="font-medium">
                                  {dayjs(slot.start).format('HH:mm')}
                                </span>
                                <span className="font-mono text-muted-foreground">
                                  {Math.round(slot.maxAvailable)}m
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center space-y-2 p-8 text-center opacity-50">
                <Bug className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium text-muted-foreground text-sm leading-tight">
                  {t('hover_to_see_logic')}
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <div className="min-h-0 flex-1">
        <SmartCalendar
          t={tCalendar}
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
                weights={weights}
              />
            ) : null
          }
        />
      </div>
    </div>
  );
}
