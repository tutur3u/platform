'use client';

import type {
  TimeTrackingCategory,
  TimeTrackingSession,
  WorkspaceTask,
} from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  CheckCircle,
  Clock,
  Copy,
  ExternalLink,
  MapPin,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Square,
  Tag,
  Timer,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useRef, useState } from 'react';

interface ExtendedWorkspaceTask extends Partial<WorkspaceTask> {
  board_name?: string;
  list_name?: string;
  assignees?: Array<{
    id: string;
    display_name?: string;
    avatar_url?: string;
    email?: string;
  }>;
  is_assigned_to_current_user?: boolean;
}

interface SessionWithRelations extends TimeTrackingSession {
  category: TimeTrackingCategory | null;
  task: WorkspaceTask | null;
}

interface SessionTemplate {
  title: string;
  description?: string;
  category_id?: string;
  task_id?: string;
  tags?: string[];
  category?: TimeTrackingCategory;
  task?: WorkspaceTask;
  usage_count: number;
}

interface TaskBoard {
  id: string;
  name: string;
  created_at: string;
  task_lists: TaskList[];
}

interface TaskList {
  id: string;
  name: string;
  status: string;
  color: string;
  position: number;
}

interface TimerControlsProps {
  wsId: string;
  currentSession: SessionWithRelations | null;
  // eslint-disable-next-line no-unused-vars
  setCurrentSession: (session: SessionWithRelations | null) => void;
  elapsedTime: number;
  // eslint-disable-next-line no-unused-vars
  setElapsedTime: (time: number) => void;
  isRunning: boolean;
  // eslint-disable-next-line no-unused-vars
  setIsRunning: (running: boolean) => void;
  categories: TimeTrackingCategory[];
  tasks: ExtendedWorkspaceTask[];
  onSessionUpdate: () => void;
  // eslint-disable-next-line no-unused-vars
  formatTime: (seconds: number) => string;
  // eslint-disable-next-line no-unused-vars
  formatDuration: (seconds: number) => string;
  // eslint-disable-next-line no-unused-vars
  apiCall: (url: string, options?: RequestInit) => Promise<any>;
  isDraggingTask?: boolean;
  onGoToTasksTab?: () => void;
}

export function TimerControls({
  wsId,
  currentSession,
  setCurrentSession,
  elapsedTime,
  setElapsedTime,
  isRunning,
  setIsRunning,
  categories,
  tasks,
  onSessionUpdate,
  formatTime,
  formatDuration,
  apiCall,
  isDraggingTask = false,
  onGoToTasksTab,
}: TimerControlsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionDescription, setNewSessionDescription] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('none');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('none');
  const [sessionMode, setSessionMode] = useState<'task' | 'manual'>('task');
  const [showTaskSuggestion, setShowTaskSuggestion] = useState(false);
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [justCompleted, setJustCompleted] =
    useState<SessionWithRelations | null>(null);

  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // Task search and filter state
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [taskFilters, setTaskFilters] = useState({
    priority: 'all',
    status: 'all',
    board: 'all',
    list: 'all',
    assignee: 'all',
  });
  const [isTaskDropdownOpen, setIsTaskDropdownOpen] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);

  // Dropdown positioning state
  const [dropdownPosition, setDropdownPosition] = useState<'below' | 'above'>(
    'below'
  );

  // Refs for positioning
  const dropdownContainerRef = useRef<HTMLDivElement>(null);
  const dropdownContentRef = useRef<HTMLDivElement>(null);

  // Task creation state
  const [boards, setBoards] = useState<TaskBoard[]>([]);
  const [showTaskCreation, setShowTaskCreation] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Fetch boards with lists
  const fetchBoards = useCallback(async () => {
    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/boards-with-lists`
      );
      setBoards(response.boards || []);
    } catch (error) {
      console.error('Error fetching boards:', error);
      toast.error('Failed to load boards');
    }
  }, [wsId, apiCall]);

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/templates`
      );
      setTemplates(response.templates || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  }, [wsId, apiCall]);

  useEffect(() => {
    fetchTemplates();
    fetchBoards();
  }, [fetchTemplates, fetchBoards]);

  // Handle task selection change
  const handleTaskSelectionChange = (taskId: string) => {
    setSelectedTaskId(taskId);
    if (taskId && taskId !== 'none') {
      const selectedTask = tasks.find((t) => t.id === taskId);
      if (selectedTask) {
        // Set task mode and populate fields (same as drag & drop)
        setSessionMode('task');
        setNewSessionTitle(`Working on: ${selectedTask.name}`);
        setNewSessionDescription(selectedTask.description || '');

        // Show success feedback (same as drag & drop)
        toast.success(`Task "${selectedTask.name}" ready to track!`, {
          description:
            'Click Start Timer to begin tracking time for this task.',
          duration: 3000,
        });

        // Close dropdown and exit search mode
        setIsTaskDropdownOpen(false);
        setIsSearchMode(false);
        setTaskSearchQuery('');
      }
    } else {
      // Reset when no task selected
      setNewSessionTitle('');
      setNewSessionDescription('');
      setIsSearchMode(true);
    }
  };

  // Handle session mode change with cleanup
  const handleSessionModeChange = (mode: 'task' | 'manual') => {
    const previousMode = sessionMode;
    setSessionMode(mode);

    // Clear form state when switching modes for better UX
    setNewSessionTitle('');
    setNewSessionDescription('');
    setSelectedTaskId('none');
    setShowTaskSuggestion(false);

    // Reset any temporary states
    setSelectedCategoryId('none');
    setIsSearchMode(true);
    setTaskSearchQuery('');
    setIsTaskDropdownOpen(false);

    // Provide helpful feedback
    if (previousMode !== mode) {
      if (mode === 'manual') {
        toast.success('Switched to manual mode - start typing freely!', {
          duration: 2000,
        });
      } else {
        toast.success(
          'Switched to task-based mode - select or create a task!',
          {
            duration: 2000,
          }
        );
      }
    }
  };

  // Handle manual title change with task suggestion
  const handleManualTitleChange = (title: string) => {
    setNewSessionTitle(title);

    // Check if title matches any existing task
    const matchingTask = tasks.find(
      (task) =>
        task.name?.toLowerCase().includes(title.toLowerCase()) &&
        title.length > 2
    );

    if (matchingTask && title.length > 2) {
      setSelectedTaskId(matchingTask.id!);
      setShowTaskSuggestion(false);
    } else if (
      title.length > 2 &&
      (selectedTaskId === 'none' || !selectedTaskId)
    ) {
      // Suggest creating a new task if title doesn't match any existing task
      setShowTaskSuggestion(true);
    } else {
      setShowTaskSuggestion(false);
    }
  };

  // Create task from manual session
  const createTaskFromManualSession = async () => {
    setNewTaskName(newSessionTitle);
    setShowTaskCreation(true);
    setShowTaskSuggestion(false);
  };

  // Create new task
  const createTask = async () => {
    if (!newTaskName.trim()) {
      toast.error('Please enter a task name');
      return;
    }

    if (!selectedListId) {
      toast.error('Please select a list');
      return;
    }

    setIsCreatingTask(true);

    try {
      const response = await apiCall(`/api/v1/workspaces/${wsId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          name: newTaskName,
          description: newTaskDescription || null,
          listId: selectedListId,
        }),
      });

      const newTask = response.task;
      setSelectedTaskId(newTask.id);

      // In task mode, set the title to the working format
      // In manual mode, keep the user's original title
      if (sessionMode === 'task') {
        setNewSessionTitle(`Working on: ${newTask.name}`);
      }

      setShowTaskCreation(false);
      setNewTaskName('');
      setNewTaskDescription('');
      setSelectedBoardId('');
      setSelectedListId('');
      setShowTaskSuggestion(false);

      toast.success(`Task "${newTask.name}" created successfully!`);

      // In task mode, start timer automatically
      // In manual mode, just link the task and let user start manually
      if (sessionMode === 'task') {
        await startTimerWithTask(newTask.id, newTask.name);
      }
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Failed to create task');
    } finally {
      setIsCreatingTask(false);
    }
  };

  // Start timer with task
  const startTimerWithTask = async (taskId: string, taskName: string) => {
    setIsLoading(true);

    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: `Working on: ${taskName}`,
            description: newSessionDescription || null,
            categoryId:
              selectedCategoryId === 'none' ? null : selectedCategoryId || null,
            taskId: taskId,
          }),
        }
      );

      setCurrentSession(response.session);
      setIsRunning(true);
      setElapsedTime(0);
      setNewSessionTitle('');
      setNewSessionDescription('');
      setSelectedCategoryId('none');
      setSelectedTaskId('none');

      onSessionUpdate();
      toast.success('Timer started!');
    } catch (error) {
      console.error('Error starting timer:', error);
      toast.error('Failed to start timer');
    } finally {
      setIsLoading(false);
    }
  };

  // Start timer
  const startTimer = async () => {
    if (sessionMode === 'task' && selectedTaskId && selectedTaskId !== 'none') {
      const selectedTask = tasks.find((t) => t.id === selectedTaskId);
      if (selectedTask) {
        await startTimerWithTask(selectedTaskId, selectedTask.name!);
        return;
      }
    }

    if (
      sessionMode === 'task' &&
      (selectedTaskId === 'none' || !selectedTaskId)
    ) {
      setShowTaskCreation(true);
      return;
    }

    if (!newSessionTitle.trim()) {
      toast.error('Please enter a title for your time session');
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: newSessionTitle,
            description: newSessionDescription || null,
            categoryId:
              selectedCategoryId === 'none' ? null : selectedCategoryId || null,
            taskId: selectedTaskId === 'none' ? null : selectedTaskId || null,
          }),
        }
      );

      setCurrentSession(response.session);
      setIsRunning(true);
      setElapsedTime(0);
      setNewSessionTitle('');
      setNewSessionDescription('');
      setSelectedCategoryId('none');
      setSelectedTaskId('none');

      onSessionUpdate();
      toast.success('Timer started!');
    } catch (error) {
      console.error('Error starting timer:', error);
      toast.error('Failed to start timer');
    } finally {
      setIsLoading(false);
    }
  };

  // Stop timer
  const stopTimer = async () => {
    if (!currentSession) return;

    setIsLoading(true);

    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${currentSession.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ action: 'stop' }),
        }
      );

      const completedSession = response.session;
      setJustCompleted(completedSession);
      setCurrentSession(null);
      setIsRunning(false);
      setElapsedTime(0);

      // Show completion celebration
      setTimeout(() => setJustCompleted(null), 3000);

      onSessionUpdate();
      toast.success(
        `Session completed! Tracked ${formatDuration(completedSession.duration_seconds || 0)}`,
        {
          duration: 4000,
        }
      );
    } catch (error) {
      console.error('Error stopping timer:', error);
      toast.error('Failed to stop timer');
    } finally {
      setIsLoading(false);
    }
  };

  // Pause timer
  const pauseTimer = async () => {
    if (!currentSession) return;

    setIsLoading(true);

    try {
      await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${currentSession.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ action: 'pause' }),
        }
      );

      setCurrentSession(null);
      setIsRunning(false);
      setElapsedTime(0);

      onSessionUpdate();
      toast.success('Timer paused');
    } catch (error) {
      console.error('Error pausing timer:', error);
      toast.error('Failed to pause timer');
    } finally {
      setIsLoading(false);
    }
  };

  // Start from template
  const startFromTemplate = async (template: SessionTemplate) => {
    setNewSessionTitle(template.title);
    setNewSessionDescription(template.description || '');
    setSelectedCategoryId(template.category_id || 'none');
    setSelectedTaskId(template.task_id || 'none');
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    // Keep the drag over state active
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;

    // Only set isDragOver to false when counter reaches 0
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'task' && data.task) {
        const task = data.task;

        // Set task mode and populate fields
        setSessionMode('task');
        setSelectedTaskId(task.id);
        setNewSessionTitle(`Working on: ${task.name}`);
        setNewSessionDescription(task.description || '');

        // Exit search mode and show selected task
        setIsSearchMode(false);
        setTaskSearchQuery('');
        setIsTaskDropdownOpen(false);

        // Show success feedback
        toast.success(`Task "${task.name}" ready to track!`, {
          description:
            'Click Start Timer to begin tracking time for this task.',
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('Error handling dropped task:', error);
      toast.error('Failed to process dropped task');
    }
  };

  const getCategoryColor = (color: string) => {
    const colorMap: Record<string, string> = {
      RED: 'bg-dynamic-red/80',
      BLUE: 'bg-dynamic-blue/80',
      GREEN: 'bg-dynamic-green/80',
      YELLOW: 'bg-dynamic-yellow/80',
      ORANGE: 'bg-dynamic-orange/80',
      PURPLE: 'bg-dynamic-purple/80',
      PINK: 'bg-dynamic-pink/80',
      INDIGO: 'bg-dynamic-indigo/80',
      CYAN: 'bg-dynamic-cyan/80',
      GRAY: 'bg-dynamic-gray/80',
    };
    return colorMap[color] || 'bg-dynamic-blue/80';
  };

  // Get lists for selected board
  const selectedBoard = boards.find((board) => board.id === selectedBoardId);
  const availableLists = selectedBoard?.task_lists || [];

  // Filter and sort tasks with user prioritization
  const getFilteredTasks = () => {
    return tasks
      .filter((task) => {
        const matchesSearch = task.name
          ?.toLowerCase()
          .includes(taskSearchQuery.toLowerCase()) ||
          task.description
            ?.toLowerCase()
            .includes(taskSearchQuery.toLowerCase());
        const matchesPriority =
          taskFilters.priority === 'all' ||
          String(task.priority) === taskFilters.priority;
        const matchesStatus =
          taskFilters.status === 'all' ||
          (task.completed ? 'completed' : 'active') === taskFilters.status;
        const matchesBoard =
          taskFilters.board === 'all' || task.board_name === taskFilters.board;
        const matchesList =
          taskFilters.list === 'all' || task.list_name === taskFilters.list;
        const matchesAssignee =
          taskFilters.assignee === 'all' ||
          (taskFilters.assignee === 'mine' && task.is_assigned_to_current_user) ||
          (taskFilters.assignee === 'unassigned' && (!task.assignees || task.assignees.length === 0));

        return (
          matchesSearch &&
          matchesPriority &&
          matchesStatus &&
          matchesBoard &&
          matchesList &&
          matchesAssignee
        );
      })
      .sort((a, b) => {
        // Prioritize user's assigned tasks
        if (a.is_assigned_to_current_user && !b.is_assigned_to_current_user) {
          return -1;
        }
        if (!a.is_assigned_to_current_user && b.is_assigned_to_current_user) {
          return 1;
        }
        
        // Then sort by priority (higher priority first)
        const aPriority = a.priority || 0;
        const bPriority = b.priority || 0;
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }
        
        // Finally sort by creation date (newest first)
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
  };

  // Get unique boards and lists for filter options
  const uniqueBoards = [
    ...new Set(
      tasks
        .map((task) => task.board_name)
        .filter((name): name is string => Boolean(name))
    ),
  ];
  const uniqueLists = [
    ...new Set(
      tasks
        .map((task) => task.list_name)
        .filter((name): name is string => Boolean(name))
    ),
  ];

  // Calculate dropdown position
  const calculateDropdownPosition = useCallback(() => {
    if (!dropdownContainerRef.current) return;

    const container = dropdownContainerRef.current;
    const rect = container.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 400; // max-height of dropdown
    const buffer = 20; // Buffer from viewport edges

    // Calculate available space
    const spaceBelow = viewportHeight - rect.bottom - buffer;
    const spaceAbove = rect.top - buffer;

    // Prefer below unless there's significantly more space above
    if (
      spaceBelow >= Math.min(dropdownHeight, 200) ||
      spaceBelow >= spaceAbove
    ) {
      setDropdownPosition('below');
    } else {
      setDropdownPosition('above');
    }
  }, []);

  // Check if dropdown is visible in viewport
  const isDropdownVisible = useCallback(() => {
    if (!dropdownContainerRef.current) return true;

    const rect = dropdownContainerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Check if the container is still reasonably visible
    const isVerticallyVisible = rect.bottom >= 0 && rect.top <= viewportHeight;
    const isHorizontallyVisible = rect.right >= 0 && rect.left <= viewportWidth;
    const hasMinimumVisibility = rect.height > 0 && rect.width > 0;

    return isVerticallyVisible && isHorizontallyVisible && hasMinimumVisibility;
  }, []);

  // Open dropdown with position calculation
  const openDropdown = useCallback(() => {
    setIsTaskDropdownOpen(true);
    // Use requestAnimationFrame to ensure DOM is ready for position calculation
    requestAnimationFrame(() => {
      calculateDropdownPosition();
    });
  }, [calculateDropdownPosition]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      // Check if click is outside the dropdown container
      if (
        !target.closest('[data-task-dropdown]') &&
        !target.closest('.absolute.z-\\[100\\]')
      ) {
        setIsTaskDropdownOpen(false);
        setIsSearchMode(false);
      }
    };

    if (isTaskDropdownOpen) {
      // Use capture phase to ensure we catch the event before other handlers
      document.addEventListener('mousedown', handleClickOutside, true);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside, true);
    }
  }, [isTaskDropdownOpen]);

  // Handle scroll and resize events
  useEffect(() => {
    let scrollTimeout: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      if (isTaskDropdownOpen) {
        // Clear previous timeout
        clearTimeout(scrollTimeout);

        // Throttle scroll handling
        scrollTimeout = setTimeout(() => {
          if (!isDropdownVisible()) {
            setIsTaskDropdownOpen(false);
            setIsSearchMode(false);
          } else {
            calculateDropdownPosition();
          }
        }, 16); // ~60fps
      }
    };

    const handleResize = () => {
      if (isTaskDropdownOpen) {
        calculateDropdownPosition();
      }
    };

    if (isTaskDropdownOpen) {
      // Calculate initial position
      calculateDropdownPosition();

      // Add event listeners
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);

      return () => {
        clearTimeout(scrollTimeout);
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isTaskDropdownOpen, calculateDropdownPosition, isDropdownVisible]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const isInputFocused =
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.getAttribute('contenteditable') === 'true';

      // Escape to close dropdown or cancel drag
      if (event.key === 'Escape') {
        if (isTaskDropdownOpen) {
          setIsTaskDropdownOpen(false);
          return;
        }
        if (isDraggingTask) {
          // Note: This won't actually cancel the drag since it's controlled by parent
          // But it provides visual feedback
          toast.info(
            'Press ESC while dragging to cancel (drag outside to cancel)'
          );
          return;
        }
      }

      // Skip other shortcuts if typing in input
      if (isInputFocused) return;

      // Ctrl/Cmd + Enter to start/stop timer
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (isRunning) {
          stopTimer();
        } else if (newSessionTitle.trim()) {
          startTimer();
        }
      }

      // Ctrl/Cmd + P to pause
      if ((event.ctrlKey || event.metaKey) && event.key === 'p' && isRunning) {
        event.preventDefault();
        pauseTimer();
      }

      // Ctrl/Cmd + T to open task dropdown
      if ((event.ctrlKey || event.metaKey) && event.key === 't' && !isRunning) {
        event.preventDefault();
        setIsTaskDropdownOpen(!isTaskDropdownOpen);
      }

      // Ctrl/Cmd + M to switch between task/manual mode
      if ((event.ctrlKey || event.metaKey) && event.key === 'm' && !isRunning) {
        event.preventDefault();
        setSessionMode(sessionMode === 'task' ? 'manual' : 'task');
        toast.success(
          `Switched to ${sessionMode === 'task' ? 'manual' : 'task'} mode`
        );
      }

      // Arrow keys for task navigation when dropdown is open
      if (
        isTaskDropdownOpen &&
        (event.key === 'ArrowDown' || event.key === 'ArrowUp')
      ) {
        event.preventDefault();
        const filteredTasks = getFilteredTasks();
        if (filteredTasks.length === 0) return;

        const currentIndex = filteredTasks.findIndex(
          (task) => task.id === selectedTaskId
        );
        let nextIndex;

        if (event.key === 'ArrowDown') {
          nextIndex =
            currentIndex < filteredTasks.length - 1 ? currentIndex + 1 : 0;
        } else {
          nextIndex =
            currentIndex > 0 ? currentIndex - 1 : filteredTasks.length - 1;
        }

        const nextTask = filteredTasks[nextIndex];
        if (nextTask?.id) {
          setSelectedTaskId(nextTask.id);
        }
      }

      // Enter to select highlighted task when dropdown is open
      if (
        isTaskDropdownOpen &&
        event.key === 'Enter' &&
        selectedTaskId !== 'none'
      ) {
        event.preventDefault();
        handleTaskSelectionChange(selectedTaskId);
      }

      // Space to start timer with current selection
      if (event.key === ' ' && !isRunning && !isInputFocused) {
        event.preventDefault();
        if (newSessionTitle.trim()) {
          startTimer();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    isRunning,
    newSessionTitle,
    startTimer,
    stopTimer,
    pauseTimer,
    isTaskDropdownOpen,
    isDraggingTask,
    selectedTaskId,
    sessionMode,
  ]);

  return (
    <>
      <Card
        className={cn(
          'relative transition-all duration-300',
          isDraggingTask &&
            'bg-blue-50/30 shadow-lg ring-2 shadow-blue-500/20 ring-blue-500/50 dark:bg-blue-950/20'
        )}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Time Tracker
          </CardTitle>
          <div className="space-y-1 text-sm text-muted-foreground">
            <span>Track your time with detailed analytics</span>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-muted px-1.5 py-0.5">
                ⌘/Ctrl + Enter
              </span>
              to start/stop
              <span className="rounded bg-muted px-1.5 py-0.5">⌘/Ctrl + P</span>
              to pause
              <span className="rounded bg-muted px-1.5 py-0.5">⌘/Ctrl + T</span>
              for tasks
              <span className="rounded bg-muted px-1.5 py-0.5">⌘/Ctrl + M</span>
              to switch mode
              <span className="rounded bg-muted px-1.5 py-0.5">Space</span>
              to start
              <span className="rounded bg-muted px-1.5 py-0.5">↑↓</span>
              to navigate
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {currentSession ? (
            <div className="space-y-6 text-center">
              <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-red-50 to-red-100 p-6 dark:from-red-950/20 dark:to-red-900/20">
                <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-red-500/10 to-transparent opacity-30"></div>
                <div className="relative">
                  <div className="font-mono text-4xl font-bold text-red-600 transition-all duration-300 dark:text-red-400">
                    {formatTime(elapsedTime)}
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-2 text-sm text-red-600/70 dark:text-red-400/70">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-red-500"></div>
                    Started at{' '}
                    {new Date(currentSession.start_time).toLocaleTimeString()}
                  </div>
                </div>
              </div>

              <div className="text-left">
                <h3 className="text-lg font-medium">{currentSession.title}</h3>
                {currentSession.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {currentSession.description}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {currentSession.category && (
                    <Badge
                      className={cn(
                        'text-sm',
                        getCategoryColor(
                          currentSession.category.color || 'BLUE'
                        )
                      )}
                    >
                      {currentSession.category.name}
                    </Badge>
                  )}
                  {currentSession.task && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 rounded-md border border-dynamic-blue/20 bg-gradient-to-r from-dynamic-blue/10 to-dynamic-blue/5 px-2 py-1">
                        <CheckCircle className="h-3 w-3 text-dynamic-blue" />
                        <span className="text-sm font-medium text-dynamic-blue">
                          {currentSession.task.name}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-1 h-4 w-4 p-0 text-dynamic-blue/60 hover:text-dynamic-blue"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                {currentSession.task &&
                  (() => {
                    const taskWithDetails = tasks.find(
                      (t) => t.id === currentSession.task?.id
                    );
                    return taskWithDetails?.board_name &&
                      taskWithDetails?.list_name ? (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>{taskWithDetails.board_name}</span>
                        </div>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          <span>{taskWithDetails.list_name}</span>
                        </div>
                      </div>
                    ) : null;
                  })()}
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={pauseTimer}
                  disabled={isLoading}
                  variant="outline"
                  className="flex-1"
                >
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </Button>
                <Button
                  onClick={stopTimer}
                  disabled={isLoading}
                  variant="destructive"
                  className="flex-1"
                >
                  <Square className="mr-2 h-4 w-4" />
                  Stop
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div
                className={cn(
                  'rounded-lg border-2 border-dashed p-6 text-center transition-all duration-200',
                  isDragOver
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                    : isDraggingTask
                      ? 'border-blue-400/60 bg-blue-50/30 dark:bg-blue-950/10'
                      : 'border-muted-foreground/25'
                )}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Clock
                  className={cn(
                    'mx-auto mb-3 h-12 w-12 transition-colors duration-200',
                    isDragOver
                      ? 'text-blue-500'
                      : isDraggingTask
                        ? 'text-blue-400'
                        : 'text-muted-foreground'
                  )}
                />
                <p
                  className={cn(
                    'text-base transition-colors duration-200',
                    isDragOver
                      ? 'text-blue-700 dark:text-blue-300'
                      : isDraggingTask
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-muted-foreground'
                  )}
                >
                  {isDragOver
                    ? 'Drop task here to start tracking'
                    : isDraggingTask
                      ? 'Drag task here to start tracking'
                      : 'Ready to start tracking time'}
                </p>
                <p
                  className={cn(
                    'mt-2 text-xs transition-colors duration-200',
                    isDragOver
                      ? 'text-blue-600/70 dark:text-blue-400/70'
                      : isDraggingTask
                        ? 'text-blue-500/70 dark:text-blue-400/70'
                        : 'text-muted-foreground'
                  )}
                >
                  {isDragOver
                    ? 'Release to select this task'
                    : isDraggingTask
                      ? 'Drop zone is ready • Drag outside to cancel'
                      : 'Drag tasks to the search field or select manually below'}
                </p>
              </div>

              {/* Session Mode Toggle */}
              <Tabs
                value={sessionMode}
                onValueChange={(v) => handleSessionModeChange(v as any)}
              >
                <TabsList className="grid h-full w-full grid-cols-2 bg-muted/50">
                  <TabsTrigger
                    value="task"
                    className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    <CheckCircle className="h-4 w-4" />
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium">Task-based</span>
                      <span className="text-xs text-muted-foreground">
                        Select or create task
                      </span>
                    </div>
                  </TabsTrigger>
                  <TabsTrigger
                    value="manual"
                    className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    <Timer className="h-4 w-4" />
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium">Manual</span>
                      <span className="text-xs text-muted-foreground">
                        Free-form entry
                      </span>
                    </div>
                  </TabsTrigger>
                </TabsList>

                <TabsContent
                  value="task"
                  className="space-y-4 duration-300 animate-in fade-in-50 slide-in-from-bottom-2"
                >
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">
                      Select a task to track time for:
                    </Label>

                    {tasks.length === 0 ? (
                      <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-4 text-center">
                        <CheckCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                        <p className="mb-2 text-sm font-medium text-muted-foreground">
                          No tasks available
                        </p>
                        <p className="mb-3 text-xs text-muted-foreground">
                          Create tasks in your project boards to start tracking
                          time
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (onGoToTasksTab) {
                              onGoToTasksTab();
                            } else {
                              toast.info(
                                'Redirecting to Tasks tab to create a task...'
                              );
                            }
                          }}
                          className="text-xs"
                        >
                          Go to Tasks Tab
                        </Button>
                      </div>
                    ) : (
                      <>
                        {/* Searchable Task Selection */}
                        <div
                          ref={dropdownContainerRef}
                          className="relative"
                          data-task-dropdown
                          onDragEnter={handleDragEnter}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                        >
                          {/* Display Mode: Show Selected Task */}
                          {selectedTaskId &&
                            selectedTaskId !== 'none' &&
                            !isSearchMode &&
                            (() => {
                              const selectedTask = tasks.find(
                                (t) => t.id === selectedTaskId
                              );
                              return selectedTask ? (
                                <div
                                  className={cn(
                                    'flex min-h-[2.5rem] cursor-text items-center gap-2 rounded-md border px-3 py-2 transition-all duration-200',
                                    isDragOver
                                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                                      : isDraggingTask
                                        ? 'border-blue-400/60 bg-blue-50/20 dark:bg-blue-950/10'
                                        : ''
                                  )}
                                  onClick={() => {
                                    setIsSearchMode(true);
                                    setTaskSearchQuery('');
                                    openDropdown();
                                  }}
                                >
                                  <div className="flex h-6 w-6 items-center justify-center rounded border border-dynamic-blue/30 bg-gradient-to-br from-dynamic-blue/20 to-dynamic-blue/10">
                                    <CheckCircle className="h-3 w-3 text-dynamic-blue" />
                                  </div>
                                  <div className="flex-1 text-left">
                                    <div className="text-sm font-medium">
                                      {selectedTask.name}
                                    </div>
                                    {selectedTask.board_name &&
                                      selectedTask.list_name && (
                                        <div className="mt-1 flex items-center gap-1">
                                          <span className="text-xs text-muted-foreground">
                                            {selectedTask.board_name}
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            •
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            {selectedTask.list_name}
                                          </span>
                                        </div>
                                      )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setSelectedTaskId('none');
                                        setIsSearchMode(true);
                                        setTaskSearchQuery('');
                                        toast.success('Task selection cleared');
                                      }}
                                      className="rounded p-1 transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                      title="Remove selected task"
                                    >
                                      <svg
                                        className="h-4 w-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M6 18L18 6M6 6l12 12"
                                        />
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (isTaskDropdownOpen) {
                                          setIsTaskDropdownOpen(false);
                                          setIsSearchMode(false);
                                        } else {
                                          openDropdown();
                                        }
                                      }}
                                      className="rounded p-1 hover:bg-muted"
                                    >
                                      <svg
                                        className={cn(
                                          'h-4 w-4 transition-transform',
                                          isTaskDropdownOpen &&
                                            (dropdownPosition === 'above'
                                              ? 'rotate-0'
                                              : 'rotate-180')
                                        )}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M19 9l-7 7-7-7"
                                        />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              ) : null;
                            })()}

                          {/* Search Mode: Show Input Field */}
                          {(isSearchMode ||
                            !selectedTaskId ||
                            selectedTaskId === 'none') && (
                            <div className="relative">
                              <Input
                                placeholder={
                                  isDragOver
                                    ? 'Drop task here to select'
                                    : isDraggingTask
                                      ? 'Drop here or press ESC to cancel'
                                      : 'Search tasks or create new...'
                                }
                                value={taskSearchQuery}
                                onChange={(e) =>
                                  setTaskSearchQuery(e.target.value)
                                }
                                onFocus={() => {
                                  setIsSearchMode(true);
                                  openDropdown();
                                }}
                                className={cn(
                                  'h-auto min-h-[2.5rem] pr-10 transition-all duration-200',
                                  isDragOver
                                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                                    : isDraggingTask
                                      ? 'border-blue-400/60 bg-blue-50/20 dark:bg-blue-950/10'
                                      : ''
                                )}
                                autoFocus={isSearchMode}
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (isTaskDropdownOpen) {
                                    setIsTaskDropdownOpen(false);
                                    setIsSearchMode(false);
                                  } else {
                                    openDropdown();
                                  }
                                }}
                                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 hover:bg-muted"
                              >
                                <svg
                                  className={cn(
                                    'h-4 w-4 transition-transform',
                                    isTaskDropdownOpen &&
                                      (dropdownPosition === 'above'
                                        ? 'rotate-0'
                                        : 'rotate-180')
                                  )}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 9l-7 7-7-7"
                                  />
                                </svg>
                              </button>
                            </div>
                          )}

                          {/* Dropdown Content */}
                          {isTaskDropdownOpen && (
                            <div
                              ref={dropdownContentRef}
                              className={cn(
                                'absolute right-0 left-0 z-[100] rounded-md border bg-popover shadow-lg transition-all duration-200',
                                dropdownPosition === 'above'
                                  ? 'bottom-full mb-1'
                                  : 'top-full mt-1'
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                            >
                              {/* Filter Buttons */}
                              <div className="space-y-2 border-b p-3">
                                <div className="text-xs font-medium text-muted-foreground">
                                  Quick Filters
                                </div>
                                
                                {/* Assignee Filters */}
                                <div className="flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setTaskFilters((prev) => ({
                                        ...prev,
                                        assignee: prev.assignee === 'mine' ? 'all' : 'mine',
                                      }));
                                    }}
                                    className={cn(
                                      'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                                      taskFilters.assignee === 'mine'
                                        ? 'border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                        : 'border-border bg-background hover:bg-muted'
                                    )}
                                  >
                                    <CheckCircle className="h-3 w-3" />
                                    My Tasks
                                    {(() => {
                                      const myTasksCount = tasks.filter(
                                        (task) => task.is_assigned_to_current_user
                                      ).length;
                                      return myTasksCount > 0 ? (
                                        <span className="ml-1 rounded-full bg-current px-1.5 py-0.5 text-[10px] text-white">
                                          {myTasksCount}
                                        </span>
                                      ) : null;
                                    })()}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setTaskFilters((prev) => ({
                                        ...prev,
                                        assignee: prev.assignee === 'unassigned' ? 'all' : 'unassigned',
                                      }));
                                    }}
                                    className={cn(
                                      'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                                      taskFilters.assignee === 'unassigned'
                                        ? 'border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                                        : 'border-border bg-background hover:bg-muted'
                                    )}
                                  >
                                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    Unassigned
                                    {(() => {
                                      const unassignedCount = tasks.filter(
                                        (task) => !task.assignees || task.assignees.length === 0
                                      ).length;
                                      return unassignedCount > 0 ? (
                                        <span className="ml-1 rounded-full bg-current px-1.5 py-0.5 text-[10px] text-white">
                                          {unassignedCount}
                                        </span>
                                      ) : null;
                                    })()}
                                  </button>
                                </div>

                                {/* Board Filters */}
                                <div className="flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setTaskFilters((prev) => ({
                                        ...prev,
                                        board: 'all',
                                      }));
                                    }}
                                    className={cn(
                                      'rounded-md border px-2 py-1 text-xs transition-colors',
                                      taskFilters.board === 'all'
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-border bg-background hover:bg-muted'
                                    )}
                                  >
                                    All Boards
                                  </button>
                                  {uniqueBoards.map((board) => (
                                    <button
                                      key={board}
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setTaskFilters((prev) => ({
                                          ...prev,
                                          board,
                                        }));
                                      }}
                                      className={cn(
                                        'rounded-md border px-2 py-1 text-xs transition-colors',
                                        taskFilters.board === board
                                          ? 'border-primary bg-primary text-primary-foreground'
                                          : 'border-border bg-background hover:bg-muted'
                                      )}
                                    >
                                      {board}
                                    </button>
                                  ))}
                                </div>

                                <div className="flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setTaskFilters((prev) => ({
                                        ...prev,
                                        list: 'all',
                                      }));
                                    }}
                                    className={cn(
                                      'rounded-md border px-2 py-1 text-xs transition-colors',
                                      taskFilters.list === 'all'
                                        ? 'border-secondary bg-secondary text-secondary-foreground'
                                        : 'border-border bg-background hover:bg-muted'
                                    )}
                                  >
                                    All Lists
                                  </button>
                                  {uniqueLists.map((list) => (
                                    <button
                                      key={list}
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setTaskFilters((prev) => ({
                                          ...prev,
                                          list,
                                        }));
                                      }}
                                      className={cn(
                                        'rounded-md border px-2 py-1 text-xs transition-colors',
                                        taskFilters.list === list
                                          ? 'border-secondary bg-secondary text-secondary-foreground'
                                          : 'border-border bg-background hover:bg-muted'
                                      )}
                                    >
                                      {list}
                                    </button>
                                  ))}
                                </div>

                                {(taskSearchQuery ||
                                  taskFilters.board !== 'all' ||
                                  taskFilters.list !== 'all' ||
                                  taskFilters.assignee !== 'all') && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">
                                      {getFilteredTasks().length} of{' '}
                                      {tasks.length} tasks
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setTaskSearchQuery('');
                                        setTaskFilters({
                                          board: 'all',
                                          list: 'all',
                                          priority: 'all',
                                          status: 'all',
                                          assignee: 'all',
                                        });
                                      }}
                                      className="text-muted-foreground hover:text-foreground"
                                    >
                                      Clear filters
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Task List */}
                              <div className="max-h-[300px] overflow-y-auto">
                                {getFilteredTasks().length === 0 ? (
                                  <div className="p-6 text-center text-sm text-muted-foreground">
                                    {taskSearchQuery ||
                                    taskFilters.board !== 'all' ||
                                    taskFilters.list !== 'all' ||
                                    taskFilters.assignee !== 'all' ? (
                                      <>
                                        <div className="mb-2">
                                          No tasks found matching your criteria
                                        </div>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setTaskSearchQuery('');
                                            setTaskFilters({
                                              board: 'all',
                                              list: 'all',
                                              priority: 'all',
                                              status: 'all',
                                              assignee: 'all',
                                            });
                                          }}
                                          className="text-xs text-primary hover:underline"
                                        >
                                          Clear filters to see all tasks
                                        </button>
                                      </>
                                    ) : (
                                      'No tasks available'
                                    )}
                                  </div>
                                ) : (
                                  getFilteredTasks().map((task) => (
                                    <button
                                      key={task.id}
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (task.id) {
                                          handleTaskSelectionChange(task.id);
                                        }
                                      }}
                                      className="w-full p-0 text-left transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
                                    >
                                      <div className={cn(
                                        "flex w-full items-start gap-3 p-3 hover:bg-muted/30",
                                        task.is_assigned_to_current_user && "bg-blue-50/50 dark:bg-blue-950/20"
                                      )}>
                                        <div className={cn(
                                          "flex h-8 w-8 items-center justify-center rounded-lg border",
                                          task.is_assigned_to_current_user
                                            ? "border-blue-400/50 bg-gradient-to-br from-blue-100 to-blue-200 dark:border-blue-600 dark:from-blue-800 dark:to-blue-700"
                                            : "border-dynamic-blue/30 bg-gradient-to-br from-dynamic-blue/20 to-dynamic-blue/10"
                                        )}>
                                          <CheckCircle className={cn(
                                            "h-4 w-4",
                                            task.is_assigned_to_current_user
                                              ? "text-blue-700 dark:text-blue-300"
                                              : "text-dynamic-blue"
                                          )} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2">
                                            <span className={cn(
                                              "text-sm font-medium",
                                              task.is_assigned_to_current_user && "text-blue-900 dark:text-blue-100"
                                            )}>
                                              {task.name}
                                              {task.is_assigned_to_current_user && (
                                                <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                                                  Assigned to you
                                                </span>
                                              )}
                                            </span>
                                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                          </div>
                                          {task.description && (
                                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                              {task.description}
                                            </p>
                                          )}
                                          
                                          {/* Assignees Display */}
                                          {task.assignees && task.assignees.length > 0 && (
                                            <div className="mt-2 flex items-center gap-2">
                                              <div className="flex -space-x-1">
                                                {task.assignees.slice(0, 3).map((assignee) => (
                                                  <div
                                                    key={assignee.id}
                                                    className="h-4 w-4 rounded-full border border-white bg-gradient-to-br from-gray-100 to-gray-200 dark:border-gray-800 dark:from-gray-700 dark:to-gray-600"
                                                    title={assignee.display_name || assignee.email}
                                                  >
                                                    {assignee.avatar_url ? (
                                                      <img
                                                        src={assignee.avatar_url}
                                                        alt={assignee.display_name || assignee.email || ''}
                                                        className="h-full w-full rounded-full object-cover"
                                                      />
                                                    ) : (
                                                                                                             <div className="flex h-full w-full items-center justify-center text-[8px] font-medium text-gray-600 dark:text-gray-300">
                                                         {(assignee.display_name?.[0] || assignee.email?.[0] || '?').toUpperCase()}
                                                       </div>
                                                    )}
                                                  </div>
                                                ))}
                                                {task.assignees.length > 3 && (
                                                  <div className="flex h-4 w-4 items-center justify-center rounded-full border border-white bg-gray-200 text-[8px] font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                                    +{task.assignees.length - 3}
                                                  </div>
                                                )}
                                              </div>
                                              <span className="text-xs text-muted-foreground">
                                                {task.assignees.length} assigned
                                              </span>
                                            </div>
                                          )}

                                          {task.board_name &&
                                            task.list_name && (
                                              <div className="mt-2 flex items-center gap-2">
                                                <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1">
                                                  <MapPin className="h-3 w-3 text-muted-foreground" />
                                                  <span className="text-xs font-medium">
                                                    {task.board_name}
                                                  </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 rounded-md border border-dynamic-green/20 bg-gradient-to-r from-dynamic-green/10 to-dynamic-green/5 px-2 py-1">
                                                  <Tag className="h-3 w-3 text-dynamic-green" />
                                                  <span className="text-xs font-medium text-dynamic-green">
                                                    {task.list_name}
                                                  </span>
                                                </div>
                                              </div>
                                            )}
                                        </div>
                                      </div>
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {(selectedTaskId === 'none' || !selectedTaskId) && (
                          <div className="text-center">
                            <p className="mb-2 text-sm text-muted-foreground">
                              No task selected? We'll help you create one!
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="session-description">
                      Session notes (optional)
                    </Label>
                    <Textarea
                      id="session-description"
                      placeholder="Add session notes..."
                      value={newSessionDescription}
                      onChange={(e) => setNewSessionDescription(e.target.value)}
                      rows={2}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="category-select">Category (optional)</Label>
                    <Select
                      value={selectedCategoryId}
                      onValueChange={setSelectedCategoryId}
                    >
                      <SelectTrigger id="category-select" className="mt-1">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No category</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  'h-3 w-3 rounded-full',
                                  getCategoryColor(category.color || 'BLUE')
                                )}
                              />
                              {category.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={startTimer}
                    disabled={isLoading}
                    className="w-full"
                    size="lg"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    {selectedTaskId && selectedTaskId !== 'none'
                      ? 'Start Timer'
                      : 'Create Task & Start Timer'}
                  </Button>
                </TabsContent>

                <TabsContent
                  value="manual"
                  className="space-y-4 duration-300 animate-in fade-in-50 slide-in-from-bottom-2"
                >
                  <div className="space-y-2">
                    <Label htmlFor="session-title">
                      What are you working on?
                    </Label>
                    <Input
                      id="session-title"
                      placeholder="Enter session title..."
                      value={newSessionTitle}
                      onChange={(e) => handleManualTitleChange(e.target.value)}
                      className="mt-1"
                      autoFocus={sessionMode === 'manual'}
                    />

                    {/* Task suggestion */}
                    {showTaskSuggestion && newSessionTitle.length > 2 && (
                      <div className="rounded-lg border border-dynamic-blue/30 bg-gradient-to-r from-dynamic-blue/10 to-dynamic-blue/5 p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2">
                            <div className="rounded-full bg-dynamic-blue/20 p-1">
                              <Sparkles className="h-3 w-3 text-dynamic-blue" />
                            </div>
                            <div className="flex-1">
                              <span className="text-sm font-medium text-dynamic-blue">
                                Convert to task?
                              </span>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Create "{newSessionTitle}" as a new task for
                                better organization and tracking.
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={createTaskFromManualSession}
                            className="h-8 border-dynamic-blue/30 bg-dynamic-blue/10 text-xs text-dynamic-blue hover:bg-dynamic-blue/20"
                          >
                            Create Task
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Show selected task info */}
                    {selectedTaskId &&
                      selectedTaskId !== 'none' &&
                      !showTaskSuggestion && (
                        <div className="rounded-lg border border-dynamic-green/30 bg-gradient-to-r from-dynamic-green/5 to-dynamic-green/3 p-4 shadow-sm">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-dynamic-green/30 bg-gradient-to-br from-dynamic-green/20 to-dynamic-green/10">
                              <CheckCircle className="h-5 w-5 text-dynamic-green" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-dynamic-green">
                                    Task Linked Successfully
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </Button>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedTaskId('none');
                                    setShowTaskSuggestion(
                                      newSessionTitle.length > 2
                                    );
                                  }}
                                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                >
                                  Unlink
                                </Button>
                              </div>
                              {(() => {
                                const selectedTask = tasks.find(
                                  (t) => t.id === selectedTaskId
                                );
                                return selectedTask ? (
                                  <div className="mt-2 space-y-2">
                                    <p className="text-sm font-medium text-foreground">
                                      {selectedTask.name}
                                    </p>
                                    {selectedTask.description && (
                                      <p className="line-clamp-2 text-xs text-muted-foreground">
                                        {selectedTask.description}
                                      </p>
                                    )}
                                    {selectedTask.board_name &&
                                      selectedTask.list_name && (
                                        <div className="flex items-center gap-2">
                                          <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1">
                                            <MapPin className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-xs font-medium">
                                              {selectedTask.board_name}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1.5 rounded-md border border-dynamic-green/20 bg-gradient-to-r from-dynamic-green/10 to-dynamic-green/5 px-2 py-1">
                                            <Tag className="h-3 w-3 text-dynamic-green" />
                                            <span className="text-xs font-medium text-dynamic-green">
                                              {selectedTask.list_name}
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                    <p className="text-xs text-dynamic-green/80">
                                      Time will be automatically tracked for
                                      this task
                                    </p>
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          </div>
                        </div>
                      )}
                  </div>

                  <div>
                    <Label htmlFor="session-description">
                      Description (optional)
                    </Label>
                    <Textarea
                      id="session-description"
                      placeholder="Add description..."
                      value={newSessionDescription}
                      onChange={(e) => setNewSessionDescription(e.target.value)}
                      rows={3}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="category-select">Category (optional)</Label>
                    <Select
                      value={selectedCategoryId}
                      onValueChange={setSelectedCategoryId}
                    >
                      <SelectTrigger id="category-select" className="mt-1">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No category</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  'h-3 w-3 rounded-full',
                                  getCategoryColor(category.color || 'BLUE')
                                )}
                              />
                              {category.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={startTimer}
                    disabled={!newSessionTitle.trim() || isLoading}
                    className="w-full"
                    size="lg"
                  >
                    <Play className="mr-2 h-5 w-5" />
                    Start Timer
                  </Button>
                </TabsContent>
              </Tabs>

              {/* Quick Start Templates */}
              {templates.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm text-muted-foreground">
                    Quick Start:
                  </Label>
                  <div className="space-y-2">
                    {templates.slice(0, 3).map((template, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        onClick={() => startFromTemplate(template)}
                        className="w-full justify-start text-sm"
                      >
                        <Copy className="mr-2 h-3 w-3" />
                        {template.title}
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {template.usage_count}×
                        </Badge>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>

        {/* Completion Celebration */}
        {justCompleted && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-black/20 backdrop-blur-sm duration-300 animate-in fade-in">
            <div className="rounded-lg border bg-background p-6 shadow-xl duration-300 animate-in zoom-in">
              <div className="text-center">
                <CheckCircle className="mx-auto mb-4 h-12 w-12 animate-pulse text-green-500" />
                <h3 className="mb-2 text-lg font-semibold">
                  Session Completed!
                </h3>
                <p className="mb-1 text-muted-foreground">
                  {justCompleted.title}
                </p>
                <p className="text-sm font-medium text-green-600">
                  {formatDuration(justCompleted.duration_seconds || 0)} tracked
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Task Creation Dialog */}
      <Dialog open={showTaskCreation} onOpenChange={setShowTaskCreation}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Create New Task
            </DialogTitle>
            <DialogDescription>
              Create a new task to track time for. We'll start the timer
              automatically once the task is created.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="task-name">Task Name</Label>
              <Input
                id="task-name"
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                placeholder="What are you working on?"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="task-description">Description (Optional)</Label>
              <Textarea
                id="task-description"
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="Add details about this task..."
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="board-select">Board</Label>
              <Select
                value={selectedBoardId}
                onValueChange={(value) => {
                  setSelectedBoardId(value);
                  setSelectedListId(''); // Reset list when board changes
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a board" />
                </SelectTrigger>
                <SelectContent>
                  {boards.map((board) => (
                    <SelectItem key={board.id} value={board.id}>
                      {board.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedBoardId && (
              <div>
                <Label htmlFor="list-select">List</Label>
                <Select
                  value={selectedListId}
                  onValueChange={setSelectedListId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a list" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'h-3 w-3 rounded-full',
                              getCategoryColor(list.color.toUpperCase())
                            )}
                          />
                          {list.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowTaskCreation(false);
                  setNewTaskName('');
                  setNewTaskDescription('');
                  setSelectedBoardId('');
                  setSelectedListId('');
                }}
                className="flex-1"
                disabled={isCreatingTask}
              >
                Cancel
              </Button>
              <Button
                onClick={createTask}
                disabled={
                  isCreatingTask || !newTaskName.trim() || !selectedListId
                }
                className="flex-1"
              >
                {isCreatingTask ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Create & Start Timer
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
