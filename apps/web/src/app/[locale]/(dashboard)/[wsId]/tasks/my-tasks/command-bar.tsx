'use client';

import {
  ArrowRight,
  Box,
  Calendar,
  Flag,
  LayoutDashboard,
  ListTodo,
  MapPin,
  Plus,
  Settings,
  Sparkles,
  Tag,
  Timer,
  X,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import {
  buildEstimationIndices,
  mapEstimationPoints,
} from '@tuturuuu/ui/tu-do/shared/estimation-mapping';
import { cn } from '@tuturuuu/utils/format';
import type { KeyboardEvent } from 'react';
import { useMemo, useState } from 'react';

export type CommandMode = 'note' | 'task';

export interface TaskOptions {
  priority?: 'critical' | 'high' | 'normal' | 'low' | null;
  dueDate?: Date | null;
  estimationPoints?: number | null;
  labelIds?: string[];
  projectIds?: string[];
}

interface WorkspaceLabel {
  id: string;
  name: string;
  color: string;
}

interface WorkspaceProject {
  id: string;
  name: string;
}

interface WorkspaceEstimationConfig {
  estimation_type?: string | null;
  extended_estimation?: boolean | null;
  allow_zero_estimates?: boolean | null;
}

interface CommandBarProps {
  onCreateNote: (content: string) => Promise<void>;
  onCreateTask: (title: string, options?: TaskOptions) => void;
  onGenerateAI: (entry: string) => void;
  onOpenBoardSelector: () => void;
  selectedDestination: {
    boardName?: string;
    listName?: string;
  } | null;
  onClearDestination: () => void;
  isLoading?: boolean;
  aiGenerateDescriptions?: boolean;
  aiGeneratePriority?: boolean;
  aiGenerateLabels?: boolean;
  onAiGenerateDescriptionsChange?: (value: boolean) => void;
  onAiGeneratePriorityChange?: (value: boolean) => void;
  onAiGenerateLabelsChange?: (value: boolean) => void;
  mode?: CommandMode;
  onModeChange?: (mode: CommandMode) => void;
  workspaceLabels?: WorkspaceLabel[];
  workspaceProjects?: WorkspaceProject[];
  workspaceEstimationConfig?: WorkspaceEstimationConfig | null;
  wsId?: string;
}

export function CommandBar({
  onCreateNote,
  onCreateTask,
  onGenerateAI,
  onOpenBoardSelector,
  selectedDestination,
  onClearDestination,
  isLoading = false,
  aiGenerateDescriptions = true,
  aiGeneratePriority = true,
  aiGenerateLabels = true,
  onAiGenerateDescriptionsChange,
  onAiGeneratePriorityChange,
  onAiGenerateLabelsChange,
  mode: controlledMode,
  onModeChange,
  workspaceLabels = [],
  workspaceProjects = [],
  workspaceEstimationConfig = null,
}: CommandBarProps) {
  const [internalMode, setInternalMode] = useState<CommandMode>('task');
  const [inputText, setInputText] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);

  // Optional task fields
  const [priority, setPriority] = useState<
    'critical' | 'high' | 'normal' | 'low' | null
  >(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [estimationPoints, setEstimationPoints] = useState<number | null>(null);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  // Popover open states
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [estimationOpen, setEstimationOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);

  // Use controlled mode if provided, otherwise use internal state
  const mode = controlledMode ?? internalMode;
  const setMode = (newMode: CommandMode) => {
    setInternalMode(newMode);
    onModeChange?.(newMode);
  };

  // Calculate dynamic height for projects popover
  // Each item is roughly 36px (with line-clamp-1), show max 4.5 items
  const projectsScrollHeight = useMemo(() => {
    const ITEM_HEIGHT = 36; // approximate height per project item
    const MAX_VISIBLE_ITEMS = 4.5; // show 4 full items + partial 5th
    const calculatedHeight = Math.min(
      workspaceProjects.length * ITEM_HEIGHT,
      MAX_VISIBLE_ITEMS * ITEM_HEIGHT
    );
    return calculatedHeight;
  }, [workspaceProjects.length]);

  // Calculate available estimation indices based on board config
  const availableEstimationIndices = useMemo(() => {
    return buildEstimationIndices({
      extended: workspaceEstimationConfig?.extended_estimation,
      allowZero: workspaceEstimationConfig?.allow_zero_estimates,
    });
  }, [workspaceEstimationConfig]);

  const modeConfig = useMemo(
    () => ({
      note: {
        label: 'Note',
        description: 'Quick capture for thoughts and ideas',
        placeholder: 'Jot down a quick note...',
      },
      task: {
        label: 'Task',
        description: 'Create actionable tasks with details',
        placeholder: "What's on your mind?",
      },
    }),
    []
  );

  const currentConfig = modeConfig[mode];
  const needsDestination = mode === 'task';
  const hasDestination = Boolean(
    selectedDestination?.boardName && selectedDestination?.listName
  );
  const canExecute = Boolean(inputText.trim());

  const handleAction = async () => {
    if (!inputText.trim()) return;

    try {
      if (mode === 'note') {
        await onCreateNote(inputText.trim());
        setInputText('');
      } else if (mode === 'task') {
        if (!hasDestination) {
          onOpenBoardSelector();
          return;
        }

        // If AI is enabled, use AI generation
        if (aiEnabled) {
          onGenerateAI(inputText.trim());
        } else {
          // Pass optional task fields
          const options: TaskOptions = {
            priority,
            dueDate,
            estimationPoints,
            labelIds:
              selectedLabelIds.length > 0 ? selectedLabelIds : undefined,
            projectIds:
              selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
          };
          onCreateTask(inputText.trim(), options);
        }
        setInputText('');
        // Reset optional fields
        setPriority(null);
        setDueDate(null);
        setEstimationPoints(null);
        setSelectedLabelIds([]);
        setSelectedProjectIds([]);
      }
    } catch (error) {
      console.error('Command bar action error:', error);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleAction();
    }
  };

  return (
    <div className="space-y-6">
      {/* Context Bar - Mode Selection and Filters */}
      <div className="group/bar relative overflow-hidden rounded-2xl border border-primary/30 p-5 shadow-2xl backdrop-blur-sm transition-all duration-500 hover:border-primary/50 hover:shadow-[0_20px_70px_-15px_rgba(var(--primary)_/_0.3)]">
        {/* Multi-layered animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.12] via-dynamic-purple/[0.10] to-dynamic-blue/[0.12] transition-opacity duration-700 group-hover/bar:opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-dynamic-pink/[0.08] to-dynamic-cyan/[0.06] transition-opacity duration-700" />
        <div className="absolute inset-0 bg-gradient-to-bl from-dynamic-orange/[0.05] via-transparent to-dynamic-green/[0.05] opacity-60 transition-opacity duration-700" />
        {/* Animated glow effect */}
        <div className="-inset-[100px] pointer-events-none absolute opacity-0 transition-opacity duration-1000 group-hover/bar:opacity-20">
          <div className="absolute inset-0 bg-gradient-to-r from-primary via-dynamic-purple to-dynamic-blue blur-3xl" />
        </div>

        <div className="relative flex items-center justify-between gap-4">
          {/* Left: Mode + Destination */}
          <div className="flex flex-1 items-center gap-3">
            {/* Mode Selector (Task/Note) */}
            <div className="flex items-center gap-1 rounded-lg border bg-background p-1 shadow-sm">
              <Button
                variant={mode === 'task' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMode('task')}
                disabled={isLoading}
                className="h-8 gap-2 px-4"
              >
                <ListTodo className="h-4 w-4" />
                <span className="font-semibold text-xs">Task</span>
              </Button>
              <Button
                variant={mode === 'note' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMode('note')}
                disabled={isLoading}
                className="h-8 gap-2 px-4"
              >
                <Plus className="h-4 w-4" />
                <span className="font-semibold text-xs">Note</span>
              </Button>
            </div>

            {/* Where (Board/List Selector) - Only for Tasks */}
            {needsDestination && (
              <>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                {hasDestination && selectedDestination ? (
                  <Badge
                    variant="outline"
                    className="h-8 gap-2 rounded-lg bg-background pr-1.5 pl-3 font-normal shadow-sm"
                  >
                    <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="max-w-[200px] truncate font-medium text-xs">
                      {selectedDestination.boardName} /{' '}
                      {selectedDestination.listName}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onClearDestination}
                      disabled={isLoading}
                      className="h-5 w-5 rounded p-0 hover:bg-muted"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenBoardSelector}
                    disabled={isLoading}
                    className="h-8 gap-2 rounded-lg bg-background px-4 shadow-sm"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="font-semibold text-xs">Select board</span>
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Right: AI Toggle */}
          <div className="flex items-center gap-2">
            {/* AI Settings - Only visible when AI is enabled */}
            {aiEnabled && mode === 'task' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isLoading}
                    className="h-8 w-8 rounded-lg bg-background p-0 shadow-sm"
                    title="AI Configuration"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2.5 border-b pb-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <h4 className="font-semibold text-sm">
                        AI Configuration
                      </h4>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label
                            htmlFor="ai-descriptions"
                            className="font-medium text-sm"
                          >
                            Generate descriptions
                          </Label>
                          <p className="text-muted-foreground text-xs">
                            Add detailed context
                          </p>
                        </div>
                        <Switch
                          id="ai-descriptions"
                          checked={aiGenerateDescriptions}
                          onCheckedChange={onAiGenerateDescriptionsChange}
                          disabled={isLoading}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label
                            htmlFor="ai-priority"
                            className="font-medium text-sm"
                          >
                            Set priority
                          </Label>
                          <p className="text-muted-foreground text-xs">
                            Auto-assign importance
                          </p>
                        </div>
                        <Switch
                          id="ai-priority"
                          checked={aiGeneratePriority}
                          onCheckedChange={onAiGeneratePriorityChange}
                          disabled={isLoading}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label
                            htmlFor="ai-labels"
                            className="font-medium text-sm"
                          >
                            Suggest labels
                          </Label>
                          <p className="text-muted-foreground text-xs">
                            Categorize automatically
                          </p>
                        </div>
                        <Switch
                          id="ai-labels"
                          checked={aiGenerateLabels}
                          onCheckedChange={onAiGenerateLabelsChange}
                          disabled={isLoading}
                        />
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            <div className="flex items-center gap-2.5 rounded-lg border bg-background px-3.5 py-2 shadow-sm">
              <Sparkles
                className={`h-4 w-4 transition-colors ${aiEnabled ? 'text-primary' : 'text-muted-foreground'}`}
              />
              <span className="font-medium text-muted-foreground text-xs">
                AI
              </span>
              <Switch
                checked={aiEnabled}
                onCheckedChange={setAiEnabled}
                disabled={isLoading}
                className="scale-90"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Input Area - Takes Center Stage */}
      <div className="relative">
        {/* Colorful inspirational glow effect behind textarea */}
        <div className="-z-10 absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/10 via-dynamic-purple/8 to-dynamic-cyan/12 opacity-0 blur-3xl transition-opacity duration-700 group-focus-within:opacity-100" />
        <div className="-z-10 absolute inset-0 rounded-3xl bg-gradient-to-tr from-dynamic-pink/8 via-dynamic-orange/6 to-dynamic-blue/10 opacity-0 blur-2xl transition-opacity duration-700 group-focus-within:opacity-80" />

        <div className="group relative">
          <Textarea
            id="my-tasks-command-bar-textarea"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={currentConfig.placeholder}
            className="min-h-[200px] resize-none rounded-3xl border border-border/40 bg-gradient-to-br from-background via-primary/5 to-dynamic-purple/8 px-8 pt-8 font-medium text-2xl leading-relaxed shadow-lg transition-all duration-300 placeholder:text-muted-foreground/40 hover:border-border/60 hover:shadow-xl focus-visible:border-primary/40 focus-visible:shadow-[0_20px_50px_-15px_rgba(var(--primary)_/_0.2)] focus-visible:ring-1 focus-visible:ring-primary/20"
            style={{
              paddingBottom:
                mode === 'task' && hasDestination && !aiEnabled
                  ? '80px'
                  : '80px',
            }}
            disabled={isLoading}
          />

          {/* Bottom Action Bar */}
          <div className="absolute right-6 bottom-6 flex items-center gap-2">
            {/* Option Buttons - Only for task mode with destination and AI disabled */}
            {mode === 'task' && hasDestination && !aiEnabled && (
              <>
                {/* Priority Popover */}
                <Popover open={priorityOpen} onOpenChange={setPriorityOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className={cn(
                        'h-10 w-10 rounded-lg transition-all',
                        priority
                          ? 'border-dynamic-red/50 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/20'
                          : 'border-border/50 hover:bg-muted'
                      )}
                    >
                      <Flag className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-2" align="end">
                    <ScrollArea className="max-h-64">
                      <div className="space-y-1">
                        <Button
                          variant={
                            priority === 'critical' ? 'default' : 'ghost'
                          }
                          size="sm"
                          className="w-full justify-start gap-2 text-dynamic-red"
                          onClick={() => {
                            setPriority('critical');
                            setPriorityOpen(false);
                          }}
                        >
                          <Flag className="h-3.5 w-3.5" />
                          Critical
                        </Button>
                        <Button
                          variant={priority === 'high' ? 'default' : 'ghost'}
                          size="sm"
                          className="w-full justify-start gap-2 text-dynamic-orange"
                          onClick={() => {
                            setPriority('high');
                            setPriorityOpen(false);
                          }}
                        >
                          <Flag className="h-3.5 w-3.5" />
                          High
                        </Button>
                        <Button
                          variant={priority === 'normal' ? 'default' : 'ghost'}
                          size="sm"
                          className="w-full justify-start gap-2 text-dynamic-blue"
                          onClick={() => {
                            setPriority('normal');
                            setPriorityOpen(false);
                          }}
                        >
                          <Flag className="h-3.5 w-3.5" />
                          Normal
                        </Button>
                        <Button
                          variant={priority === 'low' ? 'default' : 'ghost'}
                          size="sm"
                          className="w-full justify-start gap-2 text-dynamic-gray"
                          onClick={() => {
                            setPriority('low');
                            setPriorityOpen(false);
                          }}
                        >
                          <Flag className="h-3.5 w-3.5" />
                          Low
                        </Button>
                        {priority && (
                          <>
                            <div className="my-1 h-px bg-border" />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start gap-2 text-muted-foreground"
                              onClick={() => {
                                setPriority(null);
                                setPriorityOpen(false);
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                              Clear
                            </Button>
                          </>
                        )}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>

                {/* Due Date Popover */}
                <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className={cn(
                        'h-10 w-10 rounded-lg transition-all',
                        dueDate
                          ? 'border-dynamic-orange/50 bg-dynamic-orange/10 text-dynamic-orange hover:bg-dynamic-orange/20'
                          : 'border-border/50 hover:bg-muted'
                      )}
                    >
                      <Calendar className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-2" align="end">
                    <ScrollArea className="max-h-64">
                      <div className="space-y-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDueDate(new Date());
                            setDueDateOpen(false);
                          }}
                          className="w-full justify-start gap-2 text-dynamic-green"
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          Today
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const tomorrow = new Date();
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            setDueDate(tomorrow);
                            setDueDateOpen(false);
                          }}
                          className="w-full justify-start gap-2 text-dynamic-blue"
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          Tomorrow
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const nextWeek = new Date();
                            nextWeek.setDate(nextWeek.getDate() + 7);
                            setDueDate(nextWeek);
                            setDueDateOpen(false);
                          }}
                          className="w-full justify-start gap-2 text-dynamic-purple"
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          Next Week
                        </Button>
                        {dueDate && (
                          <>
                            <div className="my-1 h-px bg-border" />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start gap-2 text-muted-foreground"
                              onClick={() => {
                                setDueDate(null);
                                setDueDateOpen(false);
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                              Clear
                            </Button>
                          </>
                        )}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>

                {/* Estimation Popover */}
                {workspaceEstimationConfig &&
                  availableEstimationIndices.length > 0 && (
                    <Popover
                      open={estimationOpen}
                      onOpenChange={setEstimationOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className={cn(
                            'h-10 rounded-lg transition-all',
                            estimationPoints !== null
                              ? 'border-dynamic-blue/50 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
                              : 'border-border/50 hover:bg-muted',
                            estimationPoints !== null ? 'w-auto px-3' : 'w-10'
                          )}
                        >
                          <Timer className="h-4 w-4" />
                          {estimationPoints !== null && (
                            <span className="ml-1.5 font-semibold text-xs">
                              {mapEstimationPoints(
                                estimationPoints,
                                workspaceEstimationConfig?.estimation_type
                              )}
                            </span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-44 p-2" align="end">
                        <ScrollArea className="max-h-64">
                          <div className="grid grid-cols-3 gap-1">
                            {availableEstimationIndices.map((index) => {
                              const isExtended = index > 5;
                              const isDisabled =
                                isExtended &&
                                !workspaceEstimationConfig?.extended_estimation;

                              return (
                                <Button
                                  key={index}
                                  variant={
                                    estimationPoints === index
                                      ? 'default'
                                      : 'ghost'
                                  }
                                  size="sm"
                                  onClick={() => {
                                    if (!isDisabled) {
                                      setEstimationPoints(index);
                                      setEstimationOpen(false);
                                    }
                                  }}
                                  disabled={isDisabled}
                                  className="h-9 text-dynamic-purple"
                                  title={
                                    isDisabled
                                      ? 'Upgrade to use this value'
                                      : ''
                                  }
                                >
                                  {mapEstimationPoints(
                                    index,
                                    workspaceEstimationConfig?.estimation_type
                                  )}
                                </Button>
                              );
                            })}
                          </div>
                          {estimationPoints !== null && (
                            <>
                              <div className="my-2 h-px bg-border" />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start gap-2 text-muted-foreground"
                                onClick={() => {
                                  setEstimationPoints(null);
                                  setEstimationOpen(false);
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                                Clear
                              </Button>
                            </>
                          )}
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                  )}

                {/* Projects Popover */}
                {workspaceProjects.length > 0 && (
                  <Popover open={projectsOpen} onOpenChange={setProjectsOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className={cn(
                          'h-10 w-10 rounded-lg transition-all',
                          selectedProjectIds.length > 0
                            ? 'border-dynamic-sky/50 bg-dynamic-sky/10 text-dynamic-sky hover:bg-dynamic-sky/20'
                            : 'border-border/50 hover:bg-muted'
                        )}
                      >
                        <Box className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-0" align="end">
                      <div className="p-2">
                        <ScrollArea
                          className="w-full"
                          style={{ height: `${projectsScrollHeight}px` }}
                        >
                          <div className="space-y-1 pr-3">
                            {workspaceProjects.map((project) => (
                              <div
                                key={project.id}
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                              >
                                <Checkbox
                                  id={`cb-project-${project.id}`}
                                  checked={selectedProjectIds.includes(
                                    project.id
                                  )}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedProjectIds([
                                        ...selectedProjectIds,
                                        project.id,
                                      ]);
                                    } else {
                                      setSelectedProjectIds(
                                        selectedProjectIds.filter(
                                          (id) => id !== project.id
                                        )
                                      );
                                    }
                                  }}
                                />
                                <Label
                                  htmlFor={`cb-project-${project.id}`}
                                  className="flex flex-1 cursor-pointer items-center gap-2 font-normal text-dynamic-sky text-xs"
                                >
                                  <Box className="h-3 w-3 shrink-0" />
                                  <span className="line-clamp-1">
                                    {project.name}
                                  </span>
                                </Label>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                      {selectedProjectIds.length > 0 && (
                        <>
                          <div className="h-px bg-border" />
                          <div className="p-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start gap-2 text-muted-foreground"
                              onClick={() => {
                                setSelectedProjectIds([]);
                                setProjectsOpen(false);
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                              Clear all
                            </Button>
                          </div>
                        </>
                      )}
                    </PopoverContent>
                  </Popover>
                )}

                {/* Labels Popover */}
                {workspaceLabels.length > 0 && (
                  <Popover open={labelsOpen} onOpenChange={setLabelsOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className={cn(
                          'h-10 w-10 rounded-lg transition-all',
                          selectedLabelIds.length > 0
                            ? 'border-dynamic-purple/50 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20'
                            : 'border-border/50 hover:bg-muted'
                        )}
                      >
                        <Tag className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-0" align="end">
                      <div className="p-2">
                        <ScrollArea className="h-64">
                          <div className="space-y-1 pr-3">
                            {workspaceLabels.map((label) => (
                              <div
                                key={label.id}
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                              >
                                <Checkbox
                                  id={`cb-label-${label.id}`}
                                  checked={selectedLabelIds.includes(label.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedLabelIds([
                                        ...selectedLabelIds,
                                        label.id,
                                      ]);
                                    } else {
                                      setSelectedLabelIds(
                                        selectedLabelIds.filter(
                                          (id) => id !== label.id
                                        )
                                      );
                                    }
                                  }}
                                />
                                <Label
                                  htmlFor={`cb-label-${label.id}`}
                                  className="flex flex-1 cursor-pointer items-center gap-2 font-normal text-xs"
                                  style={{ color: label.color }}
                                >
                                  <span
                                    className="h-3 w-3 rounded-full"
                                    style={{ backgroundColor: label.color }}
                                  />
                                  {label.name}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                      {selectedLabelIds.length > 0 && (
                        <>
                          <div className="h-px bg-border" />
                          <div className="p-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start gap-2 text-muted-foreground"
                              onClick={() => {
                                setSelectedLabelIds([]);
                                setLabelsOpen(false);
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                              Clear all
                            </Button>
                          </div>
                        </>
                      )}
                    </PopoverContent>
                  </Popover>
                )}
              </>
            )}

            {/* Create Button */}
            <Button
              onClick={handleAction}
              disabled={!canExecute || isLoading}
              size="lg"
              className="h-10 gap-2 rounded-lg bg-gradient-to-r from-primary to-primary/90 px-6 font-semibold shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span className="text-sm">Creating...</span>
                </>
              ) : aiEnabled ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span className="text-sm">Generate</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span className="text-sm">Create</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Helper Text / AI Info */}
      {aiEnabled && mode === 'task' && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/40 shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-dynamic-purple/8 to-primary/12" />
          <div className="relative flex items-start gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/30 shadow-inner">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1.5">
              <p className="font-semibold text-base">
                AI-Powered Task Generation
              </p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                AI will analyze your input and intelligently create tasks with
                descriptions, priorities, and labels based on context and
                patterns.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
