import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Box,
  Calendar as CalendarIcon,
  Check,
  ChevronRight,
  Clock,
  Flag,
  List,
  Loader,
  Plus,
  Tag,
  Timer,
  Type,
  UserCircle,
  X,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { useBoardConfig } from '@tuturuuu/utils/task-helper';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  getTaskDefaults,
  isValidDefault,
  saveTaskDefaults,
} from './utils/task-defaults';

interface BoardWithLists {
  id: string;
  name: string;
  task_lists: { id: string; name: string }[];
}

export function AddTaskForm({
  wsId,
  setOpen,
  setIsLoading,
  defaultTaskName,
}: {
  wsId: string;
  setOpen: (open: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  defaultTaskName?: string;
}) {
  const router = useRouter();
  const { weekStartsOn, timezone, timeFormat } = useCalendarPreferences();

  // Multi-step state
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // Step 1: Basic Info
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [taskName, setTaskName] = useState(defaultTaskName || '');

  // Step 2: Optional Details
  const [priority, setPriority] = useState<
    'critical' | 'high' | 'normal' | 'low' | null
  >(null);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [estimationPoints, setEstimationPoints] = useState<number | null>(null);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);

  // UI state
  const [showSuccessOptions, setShowSuccessOptions] = useState(false);
  const [lastCreatedTask, setLastCreatedTask] = useState<string>('');
  const [lastCreatedTaskId, setLastCreatedTaskId] = useState<string>('');
  const taskInputRef = useRef<HTMLInputElement>(null);
  const startDatePickerRef = useRef<HTMLButtonElement>(null);
  const endDatePickerRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch boards data first
  const {
    data: boardsData,
    isLoading: boardsLoading,
    error: boardsError,
    refetch: refetchBoards,
  } = useQuery<{
    boards: BoardWithLists[];
  }>({
    queryKey: ['boards-with-lists', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/boards-with-lists`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch boards');
      }
      const data = await response.json();
      return data;
    },
    retry: 2,
    retryDelay: 1000,
  });

  const boards = boardsData?.boards;

  // Get selected board and workspace ID
  const selectedBoard = boards?.find((board) => board.id === selectedBoardId);
  const workspaceId = wsId;

  // Fetch board config for estimation settings
  const { data: boardConfig } = useBoardConfig(selectedBoardId);

  // Fetch workspace labels (only after board and list are selected)
  const { data: workspaceLabels = [], isLoading: labelsLoading } = useQuery({
    queryKey: ['workspace_labels', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/labels`);
      if (!response.ok) throw new Error('Failed to fetch labels');
      return response.json(); // API returns array directly
    },
    enabled: !!workspaceId && !!selectedBoardId && !!selectedListId,
  });

  // Fetch workspace projects (only after board and list are selected)
  const { data: workspaceProjects = [], isLoading: projectsLoading } = useQuery(
    {
      queryKey: ['workspace_projects', workspaceId],
      queryFn: async () => {
        if (!workspaceId) return [];
        const response = await fetch(
          `/api/v1/workspaces/${workspaceId}/task-projects`
        );
        if (!response.ok) throw new Error('Failed to fetch projects');
        return response.json(); // API returns array directly
      },
      enabled: !!workspaceId && !!selectedBoardId && !!selectedListId,
    }
  );

  // Fetch workspace members (only after board and list are selected)
  const { data: workspaceMembers = [], isLoading: membersLoading } = useQuery({
    queryKey: ['workspace_members', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const response = await fetch(`/api/workspaces/${workspaceId}/members`);
      if (!response.ok) throw new Error('Failed to fetch members');
      const data = await response.json();
      return data.members || [];
    },
    enabled: !!workspaceId && !!selectedBoardId && !!selectedListId,
  });

  // Focus task input when board and list are selected
  useEffect(() => {
    if (selectedBoardId && selectedListId && taskInputRef.current) {
      setTimeout(() => {
        taskInputRef.current?.focus();
      }, 100);
    }
  }, [selectedBoardId, selectedListId]);

  // Load saved defaults when boards are loaded
  useEffect(() => {
    if (boards && boards.length > 0 && !selectedBoardId) {
      const defaults = getTaskDefaults(wsId);

      if (defaults && isValidDefault(defaults, boards)) {
        // Apply saved defaults
        setSelectedBoardId(defaults.boardId);
        setSelectedListId(defaults.listId);
      }
    }
  }, [boards, wsId, selectedBoardId]);

  // Handle Escape key to close dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setOpen]);

  const createTaskMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      listId: string;
      priority?: 'critical' | 'high' | 'normal' | 'low' | null;
      start_date?: string | null;
      end_date?: string | null;
      estimation_points?: number | null;
      label_ids?: string[];
      project_ids?: string[];
      assignee_ids?: string[];
    }) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      try {
        const response = await fetch(`/api/v1/workspaces/${wsId}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorMessage = 'Failed to create task';
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch {
            // If parsing JSON fails, use status text
            errorMessage = response.statusText || errorMessage;
          }
          throw new Error(errorMessage);
        }

        return response.json();
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error(
            'Request timed out. Please check your connection and try again.'
          );
        }
        if (!navigator.onLine) {
          throw new Error(
            'No internet connection. Please check your network and try again.'
          );
        }
        throw error;
      }
    },
    onSuccess: (data) => {
      // Save defaults for next time
      if (selectedBoardId && selectedListId) {
        saveTaskDefaults(wsId, selectedBoardId, selectedListId);
      }

      toast({
        title: 'Task created successfully',
        description: 'Your new task has been added to the board.',
      });
      queryClient.invalidateQueries({
        queryKey: ['tasks', wsId],
      });
      setTaskName('');
      setShowSuccessOptions(true);
      setLastCreatedTask(data.task?.name || data.name || taskName);
      setLastCreatedTaskId(data.task?.id || data.id || '');
      setIsLoading(false);
    },
    onError: (error) => {
      toast({
        title: 'Failed to create task',
        description: error.message,
        variant: 'destructive',
      });
      setIsLoading(false);
    },
  });

  // Step navigation handlers
  const canProceedToStep2 =
    selectedBoardId && selectedListId && taskName.trim();

  const handleNextStep = () => {
    if (!canProceedToStep2) {
      toast({
        title: 'Complete required fields',
        description: 'Please select a board, list, and enter a task name.',
        variant: 'destructive',
      });
      return;
    }
    setCurrentStep(2);
  };

  const handlePrevStep = () => {
    setCurrentStep(1);
  };

  const handleCreateTask = () => {
    const taskNameValue = taskName.trim();

    if (!taskNameValue) {
      toast({
        title: 'Task name is required',
        description: 'Please enter a name for your task.',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedListId) {
      toast({
        title: 'List selection required',
        description: 'Please select a board and list for your task.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    createTaskMutation.mutate({
      name: taskNameValue,
      listId: selectedListId,
      priority: priority || null,
      start_date: startDate ? startDate.toISOString() : null,
      end_date: endDate ? endDate.toISOString() : null,
      estimation_points: estimationPoints,
      label_ids: selectedLabelIds.length > 0 ? selectedLabelIds : undefined,
      project_ids:
        selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
      assignee_ids:
        selectedAssigneeIds.length > 0 ? selectedAssigneeIds : undefined,
    });
  };

  const handleContinueAdding = () => {
    setShowSuccessOptions(false);
    setCurrentStep(1);
    setTaskName('');
    setPriority(null);
    setStartDate(undefined);
    setEndDate(undefined);
    setEstimationPoints(null);
    setSelectedLabelIds([]);
    setSelectedProjectIds([]);
    setSelectedAssigneeIds([]);
    // Focus the task input for the next task
    setTimeout(() => {
      taskInputRef.current?.focus();
    }, 100);
  };

  const handleExitModal = () => {
    setOpen(false);
  };

  const handleViewTask = () => {
    if (lastCreatedTaskId && selectedBoardId) {
      router.push(
        `/${wsId}/tasks/boards/${selectedBoardId}?task=${lastCreatedTaskId}`
      );
      setOpen(false);
    }
  };

  const handleRetryCreation = () => {
    setIsLoading(false);
    createTaskMutation.reset();
  };

  const availableLists = selectedBoard?.task_lists || [];

  const getBoardColor = (boardId: string) => {
    // Since board.color doesn't exist, we'll use a default color mapping based on board ID
    const colors = [
      'bg-dynamic-blue/10 border-dynamic-blue/20 text-dynamic-blue',
      'bg-dynamic-green/10 border-dynamic-green/20 text-dynamic-green',
      'bg-dynamic-purple/10 border-dynamic-purple/20 text-dynamic-purple',
      'bg-dynamic-orange/10 border-dynamic-orange/20 text-dynamic-orange',
      'bg-dynamic-pink/10 border-dynamic-pink/20 text-dynamic-pink',
    ];
    const hash = boardId.split('').reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
  };

  // Get estimation values based on board config
  const getEstimationValues = () => {
    if (!boardConfig?.estimation_type) return [];

    const baseValues = [1, 2, 3, 5, 8, 13, 21];
    const extendedValues = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

    if (boardConfig.extended_estimation) {
      return boardConfig.allow_zero_estimates
        ? [0, ...extendedValues]
        : extendedValues;
    }

    return boardConfig.allow_zero_estimates ? [0, ...baseValues] : baseValues;
  };

  const estimationValues = getEstimationValues();
  const hasEstimationEnabled = !!boardConfig?.estimation_type;

  // Early return if no valid workspace ID
  if (!wsId || wsId === 'undefined') {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="rounded-full bg-dynamic-orange/10 p-3">
          <AlertTriangle className="h-6 w-6 text-dynamic-orange" />
        </div>
        <div>
          <p className="font-semibold text-foreground">No workspace selected</p>
          <p className="text-muted-foreground text-sm">
            Navigate to a workspace to create tasks
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setOpen(false);
            window.location.href = '/';
          }}
        >
          Go to Dashboard
        </Button>
      </div>
    );
  }

  if (boardsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center gap-3">
          <Loader className="h-5 w-5 animate-spin text-dynamic-blue" />
          <span className="text-muted-foreground text-sm">
            Loading boards...
          </span>
        </div>
      </div>
    );
  }

  if (boardsError) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="rounded-full bg-dynamic-red/10 p-3">
          <AlertTriangle className="h-6 w-6 text-dynamic-red" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Failed to load boards</p>
          <p className="text-muted-foreground text-sm">
            {boardsError.message || 'Unable to fetch boards at the moment'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchBoards()}>
            Retry
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  if (!boards || boards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="rounded-full bg-dynamic-orange/10 p-3">
          <AlertTriangle className="h-6 w-6 text-dynamic-orange" />
        </div>
        <div>
          <p className="font-semibold text-foreground">No boards found</p>
          <p className="text-muted-foreground text-sm">
            Create a board first to add tasks
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            router.push(`/${wsId}/tasks/boards`);
            setOpen(false);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Board
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Step Indicator */}
      <div className="border-b bg-muted/30 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">
              {currentStep === 1 ? 'Create Task' : 'Add Details'}
            </h2>
            <p className="text-muted-foreground text-sm">
              {currentStep === 1
                ? 'Choose where to create your task'
                : 'Enhance your task with additional information'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border-2 font-semibold text-xs transition-colors',
                currentStep === 1
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-primary bg-primary text-primary-foreground'
              )}
            >
              1
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border-2 font-semibold text-xs transition-colors',
                currentStep === 2
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted-foreground/30 bg-muted text-muted-foreground'
              )}
            >
              2
            </div>
          </div>
        </div>
      </div>

      {/* Form Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {/* Step 1: Basic Info */}
        {currentStep === 1 && (
          <div className="space-y-4">
            {/* Board Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <List className="h-4 w-4" />
                Board <span className="text-destructive">*</span>
              </Label>
              <Select
                value={selectedBoardId}
                onValueChange={(value) => {
                  setSelectedBoardId(value);
                  setSelectedListId('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a board..." />
                </SelectTrigger>
                <SelectContent
                  className={cn(boards && boards.length > 5 && 'max-h-[200px]')}
                >
                  {boards?.map((board: any) => (
                    <SelectItem key={board.id} value={board.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'h-3 w-3 shrink-0 rounded-full',
                            getBoardColor(board.id)
                          )}
                        />
                        <span className="truncate">{board.name}</span>
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {board.task_lists?.length || 0} lists
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* List Selection */}
            {selectedBoardId && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <List className="h-4 w-4" />
                  List <span className="text-destructive">*</span>
                </Label>
                {availableLists.length === 0 ? (
                  <div className="rounded-lg border border-dynamic-orange/20 bg-dynamic-orange/5 p-3 text-center">
                    <div className="flex items-center justify-center gap-2 text-dynamic-orange text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      <span>This board has no lists</span>
                    </div>
                    <p className="mt-1 text-muted-foreground text-xs">
                      Create a list in the board first
                    </p>
                  </div>
                ) : (
                  <Select
                    value={selectedListId}
                    onValueChange={(value) => {
                      setSelectedListId(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a list..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableLists.map((list: any) => (
                        <SelectItem key={list.id} value={list.id}>
                          <div className="flex items-center gap-2">
                            <List className="h-4 w-4 text-muted-foreground" />
                            <span className="truncate">{list.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Task Name */}
            {selectedBoardId && selectedListId && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Type className="h-4 w-4" />
                  Task Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  ref={taskInputRef}
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="Enter task name..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canProceedToStep2) {
                      handleNextStep();
                    }
                  }}
                />
                {taskName.trim() && (
                  <p className="flex items-center gap-1.5 text-dynamic-green text-xs">
                    <Check className="h-3 w-3" />
                    Ready to proceed!
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Optional Details */}
        {currentStep === 2 && (
          <div className="space-y-4">
            {/* Priority */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm">
                <Flag className="h-4 w-4" />
                Priority
              </Label>
              <Select
                value={priority || 'none'}
                onValueChange={(value) =>
                  setPriority(value === 'none' ? null : (value as any))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                      No priority
                    </div>
                  </SelectItem>
                  <SelectItem value="critical">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-dynamic-red" />
                      Critical
                    </div>
                  </SelectItem>
                  <SelectItem value="high">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-dynamic-orange" />
                      High
                    </div>
                  </SelectItem>
                  <SelectItem value="normal">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-dynamic-yellow" />
                      Normal
                    </div>
                  </SelectItem>
                  <SelectItem value="low">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-dynamic-gray" />
                      Low
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Estimation - Only show if enabled for this board */}
            {hasEstimationEnabled && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Timer className="h-4 w-4" />
                  Estimation Points
                </Label>
                <Select
                  value={estimationPoints?.toString() || 'none'}
                  onValueChange={(value) =>
                    setEstimationPoints(value === 'none' ? null : Number(value))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No estimation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No estimation</SelectItem>
                    {estimationValues.map((point) => (
                      <SelectItem key={point} value={point.toString()}>
                        {point} {point === 1 ? 'point' : 'points'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Dates with Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Clock className="h-4 w-4" />
                  Start Date & Time
                </Label>
                <DateTimePicker
                  date={startDate}
                  setDate={setStartDate}
                  showTimeSelect={true}
                  maxDate={endDate}
                  showFooterControls={true}
                  allowClear={true}
                  scrollIntoViewOnOpen={true}
                  pickerButtonRef={startDatePickerRef}
                  side="bottom"
                  align="start"
                  collisionPadding={24}
                  preferences={{ weekStartsOn, timezone, timeFormat }}
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-sm">
                  <CalendarIcon className="h-4 w-4" />
                  Due Date & Time
                </Label>
                <DateTimePicker
                  date={endDate}
                  setDate={setEndDate}
                  showTimeSelect={true}
                  minDate={startDate}
                  minTime={startDate ? format(startDate, 'HH:mm') : undefined}
                  showFooterControls={true}
                  allowClear={true}
                  scrollIntoViewOnOpen={true}
                  pickerButtonRef={endDatePickerRef}
                  side="bottom"
                  align="start"
                  collisionPadding={24}
                  preferences={{ weekStartsOn, timezone, timeFormat }}
                />
              </div>
            </div>

            {/* Labels */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm">
                <Tag className="h-4 w-4" />
                Labels
                {labelsLoading && (
                  <Loader className="ml-1 h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </Label>
              <Select
                value={selectedLabelIds[0] || 'none'}
                onValueChange={(value) => {
                  if (value === 'none') {
                    setSelectedLabelIds([]);
                  } else {
                    setSelectedLabelIds((prev) =>
                      prev.includes(value)
                        ? prev.filter((id) => id !== value)
                        : [...prev, value]
                    );
                  }
                }}
                disabled={labelsLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      labelsLoading ? 'Loading labels...' : 'Select labels...'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No labels</SelectItem>
                  {workspaceLabels?.map((label: any) => (
                    <SelectItem key={label.id} value={label.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: label.color || '#gray' }}
                        />
                        <span>{label.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedLabelIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedLabelIds.map((labelId) => {
                    const label = workspaceLabels?.find(
                      (l: any) => l.id === labelId
                    );
                    return label ? (
                      <Badge
                        key={labelId}
                        variant="secondary"
                        className="gap-1"
                      >
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: label.color || '#gray' }}
                        />
                        {label.name}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() =>
                            setSelectedLabelIds((prev) =>
                              prev.filter((id) => id !== labelId)
                            )
                          }
                        />
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            {/* Projects */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm">
                <Box className="h-4 w-4" />
                Projects
                {projectsLoading && (
                  <Loader className="ml-1 h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </Label>
              <Select
                value={selectedProjectIds[0] || 'none'}
                onValueChange={(value) => {
                  if (value === 'none') {
                    setSelectedProjectIds([]);
                  } else {
                    setSelectedProjectIds((prev) =>
                      prev.includes(value)
                        ? prev.filter((id) => id !== value)
                        : [...prev, value]
                    );
                  }
                }}
                disabled={projectsLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      projectsLoading
                        ? 'Loading projects...'
                        : 'Select projects...'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No projects</SelectItem>
                  {workspaceProjects?.map((project: any) => (
                    <SelectItem key={project.id} value={project.id}>
                      <div className="flex items-center gap-2">
                        <Box className="h-3 w-3" />
                        <span>{project.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProjectIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedProjectIds.map((projectId) => {
                    const project = workspaceProjects?.find(
                      (p: any) => p.id === projectId
                    );
                    return project ? (
                      <Badge
                        key={projectId}
                        variant="secondary"
                        className="gap-1"
                      >
                        <Box className="h-3 w-3" />
                        {project.name}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() =>
                            setSelectedProjectIds((prev) =>
                              prev.filter((id) => id !== projectId)
                            )
                          }
                        />
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            {/* Assignees */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm">
                <UserCircle className="h-4 w-4" />
                Assignees
                {membersLoading && (
                  <Loader className="ml-1 h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </Label>
              <Select
                value={selectedAssigneeIds[0] || 'none'}
                onValueChange={(value) => {
                  if (value === 'none') {
                    setSelectedAssigneeIds([]);
                  } else {
                    setSelectedAssigneeIds((prev) =>
                      prev.includes(value)
                        ? prev.filter((id) => id !== value)
                        : [...prev, value]
                    );
                  }
                }}
                disabled={membersLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      membersLoading
                        ? 'Loading members...'
                        : 'Select assignees...'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No assignees</SelectItem>
                  {workspaceMembers?.map((member: any) => (
                    <SelectItem key={member.id} value={member.id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={member.avatar_url} />
                          <AvatarFallback className="text-[9px]">
                            {member.display_name?.[0] ||
                              member.email?.[0] ||
                              '?'}
                          </AvatarFallback>
                        </Avatar>
                        <span>{member.display_name || member.email}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedAssigneeIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedAssigneeIds.map((assigneeId) => {
                    const member = workspaceMembers?.find(
                      (m: any) => m.id === assigneeId
                    );
                    return member ? (
                      <Badge
                        key={assigneeId}
                        variant="secondary"
                        className="gap-1"
                      >
                        <Avatar className="h-3 w-3">
                          <AvatarImage src={member.avatar_url} />
                          <AvatarFallback className="text-[8px]">
                            {member.display_name?.[0] ||
                              member.email?.[0] ||
                              '?'}
                          </AvatarFallback>
                        </Avatar>
                        {member.display_name || member.email}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() =>
                            setSelectedAssigneeIds((prev) =>
                              prev.filter((id) => id !== assigneeId)
                            )
                          }
                        />
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Success State */}
        {showSuccessOptions && (
          <div className="rounded-lg border border-dynamic-green/20 bg-dynamic-green/5 p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-full bg-dynamic-green/10 p-1">
                <Check className="h-4 w-4 text-dynamic-green" />
              </div>
              <div>
                <p className="font-medium text-dynamic-green text-sm">
                  Task created successfully!
                </p>
                <p className="text-muted-foreground text-xs">
                  "{lastCreatedTask}" has been added to your board.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {lastCreatedTaskId && (
                <Button
                  onClick={handleViewTask}
                  variant="default"
                  size="sm"
                  className="w-full"
                >
                  View Task
                </Button>
              )}
              <div className="flex gap-2">
                <Button
                  onClick={handleContinueAdding}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Plus className="mr-2 h-3 w-3" />
                  Add Another
                </Button>
                <Button
                  onClick={handleExitModal}
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {createTaskMutation.isError && !showSuccessOptions && (
          <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-dynamic-red" />
              <div>
                <p className="font-medium text-dynamic-red text-sm">
                  Failed to create task
                </p>
                <p className="text-muted-foreground text-xs">
                  {createTaskMutation.error?.message || 'Please try again'}
                </p>
              </div>
            </div>
            <Button
              onClick={handleRetryCreation}
              variant="outline"
              size="sm"
              className="w-full"
            >
              Try Again
            </Button>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {!showSuccessOptions && !createTaskMutation.isError && (
        <div className="border-t bg-muted/30 px-6 py-4">
          {currentStep === 1 ? (
            <div className="flex gap-2">
              <Button
                onClick={handleNextStep}
                disabled={!canProceedToStep2}
                className="flex-1"
              >
                Next: Add Details
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button onClick={handlePrevStep} variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleCreateTask}
                disabled={createTaskMutation.isPending}
                className="flex-1"
              >
                {createTaskMutation.isPending ? (
                  <>
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Task
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
