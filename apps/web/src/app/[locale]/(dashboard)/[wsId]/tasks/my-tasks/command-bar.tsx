'use client';

import {
  ArrowLeft,
  Box,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Flag,
  ListTodo,
  MapPin,
  Plus,
  Settings,
  Sparkles,
  StickyNote,
  Tag,
  Timer,
  UserStar,
  X,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ScrollArea, ScrollBar } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import {
  buildEstimationIndices,
  type EstimationType,
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
  assigneeIds?: string[];
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

interface WorkspaceMember {
  id: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
}

interface WorkspaceEstimationConfig {
  estimation_type?: EstimationType;
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
  workspaceMembers?: WorkspaceMember[];
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
  workspaceMembers = [],
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
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);

  // Popover states
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSettingsView, setActiveSettingsView] = useState<
    | 'main'
    | 'priority'
    | 'dueDate'
    | 'estimation'
    | 'projects'
    | 'labels'
    | 'assignees'
  >('main');

  // Use controlled mode if provided, otherwise use internal state
  const mode = controlledMode ?? internalMode;
  const setMode = (newMode: CommandMode) => {
    setInternalMode(newMode);
    onModeChange?.(newMode);
  };

  // Calculate available estimation indices based on board config
  const availableEstimationIndices = useMemo(() => {
    return buildEstimationIndices({
      extended: workspaceEstimationConfig?.extended_estimation,
      allowZero: workspaceEstimationConfig?.allow_zero_estimates,
    });
  }, [workspaceEstimationConfig]);

  // Calculate dynamic heights for scrollable sections
  // Each item is approximately 40px (py-2 = 8px top + 8px bottom + content ~24px)
  const ITEM_HEIGHT = 41;
  const ASSIGNEE_ITEM_HEIGHT = 46;
  const MAX_VISIBLE_ITEMS = 7;

  const projectsScrollHeight = useMemo(() => {
    const itemCount = Math.min(workspaceProjects.length, MAX_VISIBLE_ITEMS);
    return itemCount > 0 ? `${itemCount * ITEM_HEIGHT}px` : 'auto';
  }, [workspaceProjects.length]);

  const labelsScrollHeight = useMemo(() => {
    const itemCount = Math.min(workspaceLabels.length, MAX_VISIBLE_ITEMS);
    return itemCount > 0 ? `${itemCount * ITEM_HEIGHT}px` : 'auto';
  }, [workspaceLabels.length]);

  const assigneesScrollHeight = useMemo(() => {
    const itemCount = Math.min(workspaceMembers.length, MAX_VISIBLE_ITEMS);
    return itemCount > 0 ? `${itemCount * ASSIGNEE_ITEM_HEIGHT}px` : 'auto';
  }, [workspaceMembers.length]);

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
            assigneeIds:
              selectedAssigneeIds.length > 0 ? selectedAssigneeIds : undefined,
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
        setSelectedAssigneeIds([]);
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

  const handleSettingsOpenChange = (open: boolean) => {
    setSettingsOpen(open);
    if (!open) {
      // Reset to main view when closing
      setTimeout(() => setActiveSettingsView('main'), 200);
    }
  };

  return (
    <div className="relative">
      {/* Subtle glow effect */}
      <div className="-z-10 absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/8 to-dynamic-purple/6 opacity-0 blur-2xl transition-opacity duration-500 group-focus-within:opacity-100 md:rounded-3xl" />
      {/* Main Input Area */}
      <div className="group relative">
        <Textarea
          id="my-tasks-command-bar-textarea"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={currentConfig.placeholder}
          className="max-h-[280px] min-h-[150px] resize-none rounded-2xl border border-border/0 bg-linear-to-br from-background to-primary/15 px-4 pb-14 pt-4 text-base leading-relaxed transition-all duration-300 placeholder:text-muted-foreground/40 hover:shadow-xl focus-visible:shadow-[0_20px_50px_-15px_rgba(var(--primary)_/_0.15)] focus-visible:border-white/10 focus-visible:ring-0 sm:px-6 md:min-h-[200px] md:rounded-3xl md:px-8 md:pb-16 md:pt-6 md:text-lg lg:text-xl"
          disabled={isLoading}
        />

        {/* Bottom Action Bar */}
        <div className="absolute right-3 bottom-3 left-3 flex flex-wrap items-center justify-between gap-2 sm:flex-nowrap md:right-4 md:bottom-4 md:left-4">
          {/* Left Side: Location + Settings + AI + Destination Display */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Location Button - Only for Tasks */}
            {mode === 'task' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenBoardSelector}
                disabled={isLoading}
                className={cn(
                  'h-8 w-8 rounded-lg border p-0 transition-all md:h-9 md:w-9',
                  hasDestination
                    ? 'border-dynamic-blue/20 bg-dynamic-blue/5 text-dynamic-blue shadow-lg hover:bg-dynamic-blue/10 hover:shadow-xl md:border-border md:bg-transparent md:text-foreground md:shadow-none md:hover:bg-muted md:hover:shadow-none'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                title="Select destination"
              >
                <MapPin className="h-3.5 w-3.5 md:h-4 md:w-4" />
              </Button>
            )}

            {/* Settings Button - AI settings when AI on, Task options when AI off */}
            {mode === 'task' && hasDestination && (
              <Popover
                open={settingsOpen}
                onOpenChange={handleSettingsOpenChange}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isLoading}
                    className="h-8 w-8 rounded-lg border border-border p-0 transition-colors hover:bg-muted md:h-9 md:w-9"
                    title={aiEnabled ? 'AI Settings' : 'Task Options'}
                  >
                    <Settings className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="top"
                  className="w-72 p-0"
                  sideOffset={8}
                >
                  {aiEnabled ? (
                    // AI Settings (unchanged)
                    <div className="space-y-3 p-4">
                      <div className="flex items-center gap-2 border-b pb-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                          <Sparkles className="h-4 w-4 text-primary" />
                        </div>
                        <h4 className="font-semibold text-sm">
                          AI Configuration
                        </h4>
                      </div>
                      <div className="space-y-3">
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
                        <Separator />
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
                        <Separator />
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
                  ) : (
                    // Task Options - Two-level navigation
                    <div>
                      {activeSettingsView === 'main' ? (
                        // Main menu - List of options
                        <div className="py-1">
                          <div className="space-y-0.5 p-2">
                            <button
                              onClick={() => setActiveSettingsView('priority')}
                              className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              <div className="flex items-center gap-2">
                                <Flag className="h-4 w-4 text-muted-foreground" />
                                <span>Priority</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {priority && (
                                  <span
                                    className={cn(
                                      'text-xs font-medium',
                                      priority === 'critical' &&
                                        'text-dynamic-red',
                                      priority === 'high' &&
                                        'text-dynamic-orange',
                                      priority === 'normal' &&
                                        'text-dynamic-blue',
                                      priority === 'low' && 'text-dynamic-gray'
                                    )}
                                  >
                                    {priority.charAt(0).toUpperCase() +
                                      priority.slice(1)}
                                  </span>
                                )}
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </button>

                            <button
                              onClick={() => setActiveSettingsView('dueDate')}
                              className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span>Due Date</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {dueDate && (
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {dueDate.toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                  </span>
                                )}
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </button>

                            {workspaceEstimationConfig?.estimation_type &&
                              availableEstimationIndices.length > 0 && (
                                <button
                                  onClick={() =>
                                    setActiveSettingsView('estimation')
                                  }
                                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                                >
                                  <div className="flex items-center gap-2">
                                    <Timer className="h-4 w-4 text-muted-foreground" />
                                    <span>Estimation</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {estimationPoints !== null && (
                                      <span className="text-xs font-medium text-muted-foreground">
                                        {mapEstimationPoints(
                                          estimationPoints,
                                          workspaceEstimationConfig?.estimation_type
                                        )}
                                      </span>
                                    )}
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                </button>
                              )}

                            {workspaceProjects.length > 0 && (
                              <button
                                onClick={() =>
                                  setActiveSettingsView('projects')
                                }
                                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                              >
                                <div className="flex items-center gap-2">
                                  <Box className="h-4 w-4 text-muted-foreground" />
                                  <span>Projects</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {selectedProjectIds.length > 0 && (
                                    <span className="text-xs font-medium text-muted-foreground">
                                      {selectedProjectIds.length}
                                    </span>
                                  )}
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                </div>
                              </button>
                            )}

                            {workspaceLabels.length > 0 && (
                              <button
                                onClick={() => setActiveSettingsView('labels')}
                                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                              >
                                <div className="flex items-center gap-2">
                                  <Tag className="h-4 w-4 text-muted-foreground" />
                                  <span>Labels</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {selectedLabelIds.length > 0 && (
                                    <span className="text-xs font-medium text-muted-foreground">
                                      {selectedLabelIds.length}
                                    </span>
                                  )}
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                </div>
                              </button>
                            )}

                            {workspaceMembers.length > 0 && (
                              <button
                                onClick={() =>
                                  setActiveSettingsView('assignees')
                                }
                                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                              >
                                <div className="flex items-center gap-2">
                                  <UserStar className="h-4 w-4 text-muted-foreground" />
                                  <span>Assignees</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {selectedAssigneeIds.length > 0 && (
                                    <span className="text-xs font-medium text-muted-foreground">
                                      {selectedAssigneeIds.length}
                                    </span>
                                  )}
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                </div>
                              </button>
                            )}
                          </div>
                        </div>
                      ) : activeSettingsView === 'priority' ? (
                        // Priority selection view
                        <div>
                          <div className="space-y-0.5 p-2">
                            <button
                              onClick={() => setActiveSettingsView('main')}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              <ArrowLeft className="h-4 w-4" />
                              <span className="font-semibold">
                                Select Priority
                              </span>
                            </button>
                            <button
                              onClick={() => {
                                setPriority('critical');
                                setActiveSettingsView('main');
                              }}
                              className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              <div className="flex items-center gap-2">
                                <Flag className="h-4 w-4 text-dynamic-red" />
                                <span className="text-dynamic-red">
                                  Critical
                                </span>
                              </div>
                              {priority === 'critical' && (
                                <Check className="h-4 w-4 text-dynamic-red" />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setPriority('high');
                                setActiveSettingsView('main');
                              }}
                              className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              <div className="flex items-center gap-2">
                                <Flag className="h-4 w-4 text-dynamic-orange" />
                                <span className="text-dynamic-orange">
                                  High
                                </span>
                              </div>
                              {priority === 'high' && (
                                <Check className="h-4 w-4 text-dynamic-orange" />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setPriority('normal');
                                setActiveSettingsView('main');
                              }}
                              className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              <div className="flex items-center gap-2">
                                <Flag className="h-4 w-4 text-dynamic-blue" />
                                <span className="text-dynamic-blue">
                                  Normal
                                </span>
                              </div>
                              {priority === 'normal' && (
                                <Check className="h-4 w-4 text-dynamic-blue" />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setPriority('low');
                                setActiveSettingsView('main');
                              }}
                              className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              <div className="flex items-center gap-2">
                                <Flag className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">
                                  Low
                                </span>
                              </div>
                              {priority === 'low' && (
                                <Check className="h-4 w-4 text-muted-foreground" />
                              )}
                            </button>
                            {priority && (
                              <button
                                onClick={() => {
                                  setPriority(null);
                                  setActiveSettingsView('main');
                                }}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
                              >
                                <X className="h-4 w-4" />
                                <span>Clear</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ) : activeSettingsView === 'dueDate' ? (
                        // Due Date selection view
                        <div>
                          <div className="space-y-0.5 p-2">
                            <button
                              onClick={() => setActiveSettingsView('main')}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              <ArrowLeft className="h-4 w-4" />
                              <span className="font-semibold">
                                Select Due Date
                              </span>
                            </button>
                            <button
                              onClick={() => {
                                setDueDate(new Date());
                                setActiveSettingsView('main');
                              }}
                              className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-dynamic-green" />
                                <span>Today</span>
                              </div>
                              {dueDate?.toDateString() ===
                                new Date().toDateString() && (
                                <Check className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                const tomorrow = new Date();
                                tomorrow.setDate(tomorrow.getDate() + 1);
                                setDueDate(tomorrow);
                                setActiveSettingsView('main');
                              }}
                              className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-dynamic-blue" />
                                <span>Tomorrow</span>
                              </div>
                              {(() => {
                                const tomorrow = new Date();
                                tomorrow.setDate(tomorrow.getDate() + 1);
                                return (
                                  dueDate?.toDateString() ===
                                    tomorrow.toDateString() && (
                                    <Check className="h-4 w-4" />
                                  )
                                );
                              })()}
                            </button>
                            <button
                              onClick={() => {
                                const nextWeek = new Date();
                                nextWeek.setDate(nextWeek.getDate() + 7);
                                setDueDate(nextWeek);
                                setActiveSettingsView('main');
                              }}
                              className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-dynamic-purple" />
                                <span>Next Week</span>
                              </div>
                              {(() => {
                                const nextWeek = new Date();
                                nextWeek.setDate(nextWeek.getDate() + 7);
                                return (
                                  dueDate?.toDateString() ===
                                    nextWeek.toDateString() && (
                                    <Check className="h-4 w-4" />
                                  )
                                );
                              })()}
                            </button>
                            {dueDate && (
                              <button
                                onClick={() => {
                                  setDueDate(null);
                                  setActiveSettingsView('main');
                                }}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
                              >
                                <X className="h-4 w-4" />
                                <span>Clear</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ) : activeSettingsView === 'estimation' ? (
                        // Estimation selection view
                        <div>
                          <div className="space-y-0.5 p-2">
                            <button
                              onClick={() => setActiveSettingsView('main')}
                              className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              <ArrowLeft className="h-4 w-4" />
                              <span className="font-semibold">
                                Select Estimation
                              </span>
                            </button>
                            {availableEstimationIndices.map((index) => {
                              const isExtended = index > 5;
                              const isDisabled =
                                isExtended &&
                                !workspaceEstimationConfig?.extended_estimation;

                              return (
                                <button
                                  key={index}
                                  onClick={() => {
                                    if (!isDisabled) {
                                      setEstimationPoints(index);
                                      setActiveSettingsView('main');
                                    }
                                  }}
                                  disabled={isDisabled}
                                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                                  title={
                                    isDisabled
                                      ? 'Upgrade to use this value'
                                      : ''
                                  }
                                >
                                  <div className="flex items-center gap-2">
                                    <Timer className="h-4 w-4 text-muted-foreground" />
                                    <span>
                                      {mapEstimationPoints(
                                        index,
                                        workspaceEstimationConfig?.estimation_type
                                      )}
                                    </span>
                                  </div>
                                  {estimationPoints === index && (
                                    <Check className="h-4 w-4" />
                                  )}
                                </button>
                              );
                            })}
                            {estimationPoints !== null && (
                              <button
                                onClick={() => {
                                  setEstimationPoints(null);
                                  setActiveSettingsView('main');
                                }}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
                              >
                                <X className="h-4 w-4" />
                                <span>Clear</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ) : activeSettingsView === 'projects' ? (
                        // Projects selection view
                        <div className="space-y-0.5 p-2">
                          <button
                            onClick={() => setActiveSettingsView('main')}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                          >
                            <ArrowLeft className="h-4 w-4" />
                            <span className="font-semibold">
                              Select Projects
                            </span>
                          </button>
                          <ScrollArea style={{ height: projectsScrollHeight }}>
                            <div className="space-y-0.5">
                              {workspaceProjects.map((project) => (
                                <div
                                  key={project.id}
                                  className="flex items-center gap-2 rounded-md p-2 hover:bg-muted"
                                >
                                  <Checkbox
                                    id={`project-${project.id}`}
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
                                    htmlFor={`project-${project.id}`}
                                    className="flex flex-1 cursor-pointer items-center gap-2 text-sm"
                                  >
                                    <Box className="h-3.5 w-3.5 text-dynamic-sky" />
                                    <span className="line-clamp-1">
                                      {project.name}
                                    </span>
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                          {selectedProjectIds.length > 0 && (
                            <button
                              onClick={() => {
                                setSelectedProjectIds([]);
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
                            >
                              <X className="h-4 w-4" />
                              <span>Clear all</span>
                            </button>
                          )}
                        </div>
                      ) : activeSettingsView === 'labels' ? (
                        // Labels selection view
                        <div className="space-y-0.5 p-2">
                          <button
                            onClick={() => setActiveSettingsView('main')}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                          >
                            <ArrowLeft className="h-4 w-4" />
                            <span className="font-semibold">Select Labels</span>
                          </button>
                          <ScrollArea style={{ height: labelsScrollHeight }}>
                            <div className="space-y-0.5">
                              {workspaceLabels.map((label) => (
                                <div
                                  key={label.id}
                                  className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted"
                                >
                                  <Checkbox
                                    id={`label-${label.id}`}
                                    checked={selectedLabelIds.includes(
                                      label.id
                                    )}
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
                                    htmlFor={`label-${label.id}`}
                                    className="flex flex-1 cursor-pointer items-center gap-2 text-sm"
                                  >
                                    <span
                                      className="h-3 w-3 rounded-full"
                                      style={{ backgroundColor: label.color }}
                                    />
                                    <span
                                      className="line-clamp-1"
                                      style={{ color: label.color }}
                                    >
                                      {label.name}
                                    </span>
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                          {selectedLabelIds.length > 0 && (
                            <button
                              onClick={() => {
                                setSelectedLabelIds([]);
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
                            >
                              <X className="h-4 w-4" />
                              <span>Clear all</span>
                            </button>
                          )}
                        </div>
                      ) : activeSettingsView === 'assignees' ? (
                        // Assignees selection view
                        <div className="space-y-0.5 p-2">
                          <button
                            onClick={() => setActiveSettingsView('main')}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                          >
                            <ArrowLeft className="h-4 w-4" />
                            <span className="font-semibold">
                              Select Assignees
                            </span>
                          </button>
                          <ScrollArea style={{ height: assigneesScrollHeight }}>
                            <div className="space-y-0.5 px-2">
                              {workspaceMembers.map((member) => (
                                <button
                                  key={member.id}
                                  type="button"
                                  onClick={() => {
                                    if (
                                      selectedAssigneeIds.includes(member.id)
                                    ) {
                                      setSelectedAssigneeIds(
                                        selectedAssigneeIds.filter(
                                          (id) => id !== member.id
                                        )
                                      );
                                    } else {
                                      setSelectedAssigneeIds([
                                        ...selectedAssigneeIds,
                                        member.id,
                                      ]);
                                    }
                                  }}
                                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
                                >
                                  <Avatar className="h-6 w-6 shrink-0">
                                    <AvatarImage src={member.avatar_url} />
                                    <AvatarFallback className="text-xs">
                                      {member.display_name?.[0] ||
                                        member.email?.[0] ||
                                        '?'}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="flex-1 truncate text-sm">
                                    {member.display_name ||
                                      member.email ||
                                      'Unknown User'}
                                  </span>
                                  {selectedAssigneeIds.includes(member.id) && (
                                    <Check className="h-4 w-4 shrink-0" />
                                  )}
                                </button>
                              ))}
                            </div>
                          </ScrollArea>
                          {selectedAssigneeIds.length > 0 && (
                            <button
                              onClick={() => {
                                setSelectedAssigneeIds([]);
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
                            >
                              <X className="h-4 w-4" />
                              <span>Clear all</span>
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            )}

            {/* AI Toggle Button (like Claude's extended thinking) */}
            <Button
              variant={aiEnabled ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setAiEnabled(!aiEnabled)}
              disabled={isLoading}
              className={cn(
                'h-8 gap-1.5 rounded-lg border px-2.5 transition-all md:h-9 md:gap-2 md:px-3',
                aiEnabled
                  ? 'border-dynamic-blue/20 bg-dynamic-blue/5 text-dynamic-blue shadow-lg hover:bg-dynamic-blue/10 hover:shadow-xl'
                  : 'border-border'
              )}
            >
              <Sparkles
                className={cn(
                  'h-3.5 w-3.5 md:h-4 md:w-4',
                  aiEnabled ? 'animate-pulse' : ''
                )}
              />
              <span className="text-xs md:text-sm">AI</span>
            </Button>

            {/* Destination Display - Shows selected board/list */}
            {mode === 'task' && hasDestination && selectedDestination && (
              <div className="group/destination relative hidden items-center rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 transition-all hover:bg-dynamic-blue/10 md:inline-flex">
                <span className="text-dynamic-blue px-2.5 py-1.5 text-xs md:px-3 md:py-2 md:text-sm">
                  {selectedDestination.boardName} /{' '}
                  {selectedDestination.listName}
                </span>
                <button
                  onClick={onClearDestination}
                  className="h-full w-0 overflow-hidden pr-0 opacity-0 transition-all group-hover/destination:w-6 group-hover/destination:pr-2.5 group-hover/destination:opacity-100 md:group-hover/destination:w-7 md:group-hover/destination:pr-3"
                  title="Clear destination"
                  type="button"
                >
                  <X className="h-3 w-3 text-dynamic-blue hover:text-dynamic-blue/80 md:h-3.5 md:w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Right Side: Mode Selector + Create Button */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Mode Selector Dropdown (like Claude's model selector) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isLoading}
                  className="h-8 gap-1 rounded-lg px-2 transition-colors hover:bg-muted sm:gap-1.5 sm:px-2.5 md:h-9 md:px-3"
                >
                  {mode === 'task' ? (
                    <ListTodo className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  ) : (
                    <StickyNote className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  )}
                  <span className="text-xs capitalize md:text-sm">{mode}</span>
                  <ChevronDown className="h-3 w-3 opacity-50 md:h-3.5 md:w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  onClick={() => setMode('task')}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <ListTodo className="h-4 w-4" />
                    <span>Task</span>
                  </div>
                  {mode === 'task' && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setMode('note')}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <StickyNote className="h-4 w-4" />
                    <span>Note</span>
                  </div>
                  {mode === 'note' && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Create/Generate Button */}
            <Button
              onClick={handleAction}
              disabled={!canExecute || isLoading}
              size="sm"
              className="h-8 shrink-0 gap-1.5 rounded-lg bg-gradient-to-r from-primary to-primary/90 px-3 text-xs font-semibold shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] disabled:opacity-50 sm:gap-2 sm:px-4 md:h-9 md:text-sm"
            >
              {isLoading ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent md:h-4 md:w-4" />
                  <span className="hidden sm:inline">Creating...</span>
                </>
              ) : aiEnabled ? (
                <>
                  <Sparkles className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  <span>Generate</span>
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  <span>Create</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
