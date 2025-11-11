'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Editor, JSONContent } from '@tiptap/react';
import {
  AlertTriangle,
  Box,
  Calendar,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Flag,
  ListTodo,
  Loader2,
  MoreVertical,
  Plus,
  Tag,
  Timer,
  Trash,
  Users,
  X,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { User } from '@tuturuuu/types/primitives/User';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { useYjsCollaboration } from '@tuturuuu/ui/hooks/use-yjs-collaboration';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Switch } from '@tuturuuu/ui/switch';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { convertListItemToTask } from '@tuturuuu/utils/editor';
import { cn } from '@tuturuuu/utils/format';
import {
  invalidateTaskCaches,
  useBoardConfig,
  useUpdateTask,
  useWorkspaceLabels,
} from '@tuturuuu/utils/task-helper';
import { convertJsonContentToYjsState } from '@tuturuuu/utils/yjs-helper';
import dayjs from 'dayjs';
import debounce from 'lodash/debounce';
import { usePathname } from 'next/navigation';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import * as Y from 'yjs';
import CursorOverlayWrapper from './cursor-overlay-wrapper';
import { CustomDatePickerDialog } from './custom-date-picker/custom-date-picker-dialog';
import {
  buildEstimationIndices,
  mapEstimationPoints,
} from './estimation-mapping';
import { MentionMenu } from './mention-system/mention-menu';
import {
  createInitialSuggestionState,
  isSameSuggestionState,
  type MentionOption,
  type SuggestionState,
} from './mention-system/types';
import { useMentionSuggestions } from './mention-system/use-mention-suggestions';
import {
  filterSlashCommands,
  getSlashCommands,
  type SlashCommandDefinition,
} from './slash-commands/definitions';
import { SlashCommandMenu } from './slash-commands/slash-command-menu';
import { SyncWarningDialog } from './sync-warning-dialog';
import type { TaskFilters } from './types';
import { UserPresenceAvatarsComponent } from './user-presence-avatars';

// Module-level Supabase client singleton to avoid repeated instantiation
const supabase = createClient();

export interface TaskEditDialogProps {
  wsId: string;
  task?: Task;
  boardId: string;
  isOpen: boolean;
  availableLists?: TaskList[];
  filters?: TaskFilters;
  mode?: 'edit' | 'create';
  collaborationMode?: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

// Helper types
interface WorkspaceTaskLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

/**
 * Helper function to parse task description from various formats
 * Handles both JSONContent objects and string formats
 * @param desc - Description in object, string, or null format
 * @returns Parsed JSONContent or null
 */
function getDescriptionContent(desc: any): JSONContent | null {
  if (!desc) return null;

  // If it's already an object (from Supabase), use it directly
  if (typeof desc === 'object') {
    return desc as JSONContent;
  }

  // If it's a string, try to parse it
  try {
    return JSON.parse(desc);
  } catch {
    // If it's not valid JSON, treat it as plain text and wrap in doc structure
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: desc }],
        },
      ],
    };
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================
const DESCRIPTION_SYNC_DEBOUNCE_MS = 500; // Debounce delay for Yjs update events

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Saves Yjs-derived description to the database for embeddings and analytics
 * @param taskId - The task ID to update
 * @param getContent - Function that returns the current editor content (can be null if empty)
 * @param boardId - Board ID for cache invalidation
 * @param queryClient - React Query client for cache management
 * @param context - Optional context string for logging (e.g., 'close', 'force-close', 'auto-close')
 */
async function saveYjsDescriptionToDatabase({
  taskId,
  getContent,
  boardId,
  queryClient,
  context = 'save',
}: {
  taskId: string;
  getContent: () => JSONContent | null;
  boardId: string;
  queryClient: any;
  context?: string;
}): Promise<boolean> {
  try {
    const currentDescription = getContent();

    // Always update: null if empty, JSON string if has content
    // This ensures clearing content is properly reflected in the database
    const descriptionString = currentDescription
      ? JSON.stringify(currentDescription)
      : null;

    const { error } = await supabase
      .from('tasks')
      .update({ description: descriptionString })
      .eq('id', taskId);

    if (error) {
      console.error(`Error saving Yjs description (${context}):`, error);
      return false;
    }

    console.log(`✅ Yjs description saved for embeddings (${context})`);

    // Invalidate task caches so UI updates immediately
    await invalidateTaskCaches(queryClient, boardId);
    return true;
  } catch (error) {
    console.error(`Failed to save Yjs description (${context}):`, error);
    return false;
  }
}

function TaskEditDialogComponent({
  wsId,
  task,
  boardId,
  isOpen,
  availableLists: propAvailableLists,
  filters,
  mode = 'edit',
  collaborationMode = false,
  onClose,
  onUpdate,
}: TaskEditDialogProps) {
  const isCreateMode = mode === 'create';
  const pathname = usePathname();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ============================================================================
  // CORE TASK STATE - Basic task properties (name, description, dates, etc.)
  // ============================================================================
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState(task?.name || '');
  const [description, setDescription] = useState<JSONContent | null>(() => {
    if (task?.description) {
      if (typeof task.description === 'object') {
        return task.description as JSONContent;
      }
      try {
        return JSON.parse(task.description);
      } catch {
        return {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: task.description }],
            },
          ],
        };
      }
    }
    return null;
  });
  const [priority, setPriority] = useState<TaskPriority | null>(
    task?.priority || null
  );
  const [startDate, setStartDate] = useState<Date | undefined>(
    task?.start_date ? new Date(task.start_date) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    task?.end_date ? new Date(task.end_date) : undefined
  );
  const [selectedListId, setSelectedListId] = useState<string>(
    task?.list_id || ''
  );
  const [estimationPoints, setEstimationPoints] = useState<
    number | null | undefined
  >(task?.estimation_points ?? null);
  const [, setEstimationSaving] = useState(false);

  const previousTaskIdRef = useRef<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const richTextEditorRef = useRef<HTMLDivElement>(null);
  const lastCursorPositionRef = useRef<number | null>(null);
  const targetEditorCursorRef = useRef<number | null>(null);

  /**
   * Reference to a function that flushes pending editor content
   *
   * TYPE CONTRACT:
   * - In collaboration mode: Returns JSONContent | null (actual content from Yjs state)
   *   - null indicates empty/cleared editor
   *   - JSONContent represents the current editor state
   * - In non-collaboration mode: Returns JSONContent | null (pending changes)
   *
   * This function is provided by the RichTextEditor component and is used to:
   * 1. Extract current editor content before closing/saving
   * 2. Sync Yjs-derived description to database for embeddings and analytics
   * 3. Enable real-time UI updates (e.g., checkbox counts) without requiring save/close
   */
  const flushEditorPendingRef = useRef<(() => JSONContent | null) | undefined>(
    undefined
  );

  const updateTaskMutation = useUpdateTask(boardId);

  // ============================================================================
  // USER & COLLABORATION - User state and Yjs collaboration setup
  // ============================================================================
  const [user, setUser] = useState<User | null>(null);

  const userColor: string | undefined = useMemo(() => {
    const hashCode = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      return hash;
    };

    const colors = [
      '#3b82f6', // blue
      '#8b5cf6', // purple
      '#ec4899', // pink
      '#f97316', // orange
      '#10b981', // green
      '#06b6d4', // cyan
      '#f59e0b', // amber
      '#6366f1', // indigo
    ];

    const userId = user?.id || 'anonymous';
    const index = Math.abs(hashCode(userId)) % colors.length;
    return colors[index] || colors[0];
  }, [user?.id]);

  const { doc, provider, synced, connected } = useYjsCollaboration({
    channel: `task-editor-${task?.id || 'new'}`,
    tableName: 'tasks',
    columnName: 'description_yjs_state',
    id: task?.id || '',
    user: user
      ? {
          id: user.id || '',
          name: user.display_name || '',
          color: userColor || '',
        }
      : null,
    enabled: isOpen && !isCreateMode && collaborationMode && !!task?.id,
  });

  // Determine if we should show loading state for Yjs sync
  const isYjsSyncing = useMemo(() => {
    const collaborationEnabled =
      isOpen && !isCreateMode && collaborationMode && !!task?.id;
    return collaborationEnabled && !synced;
  }, [isOpen, isCreateMode, collaborationMode, task?.id, synced]);

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: userData } = await supabase
          .from('users')
          .select('id, display_name')
          .eq('id', user.id)
          .single();

        if (userData) {
          setUser(userData);
        }
      }
    };

    getUser();
  }, []);

  // ============================================================================
  // REALTIME SYNC - Subscribe to task changes from other users
  // ============================================================================
  useEffect(() => {
    // Only subscribe in edit mode when dialog is open and we have a task ID
    if (isCreateMode || !isOpen || !task?.id) return;

    console.log('🔄 Setting up realtime subscription for task:', task.id);

    // Helper function to fetch labels for the task
    const fetchTaskLabels = async () => {
      try {
        const { data: labelLinks, error } = await supabase
          .from('task_labels')
          .select('label_id')
          .eq('task_id', task.id);

        if (error) {
          console.error('Error fetching label links:', error);
          throw error;
        }

        if (!labelLinks || labelLinks.length === 0) {
          console.log('No labels found for task');
          return [];
        }

        const labelIds = labelLinks
          .map((l: any) => l.label_id)
          .filter((id: any) => id != null);

        if (labelIds.length === 0) return [];

        const { data: labels, error: labelsError } = await supabase
          .from('workspace_task_labels')
          .select('id, name, color, created_at')
          .in('id', labelIds);

        if (labelsError) {
          console.error('Error fetching label details:', labelsError);
          throw labelsError;
        }

        return labels || [];
      } catch (error: any) {
        console.error('Failed to fetch task labels:', {
          error,
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
        });
        return [];
      }
    };

    // Helper function to fetch assignees for the task
    const fetchTaskAssignees = async () => {
      try {
        const { data: assigneeLinks, error } = await supabase
          .from('task_assignees')
          .select('user_id')
          .eq('task_id', task.id);

        if (error) {
          console.error('Error fetching assignee links:', error);
          throw error;
        }

        if (!assigneeLinks || assigneeLinks.length === 0) {
          console.log('No assignees found for task');
          return [];
        }

        const userIds = assigneeLinks
          .map((a: any) => a.user_id)
          .filter((id: any) => id != null);

        if (userIds.length === 0) return [];

        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id, display_name, avatar_url')
          .in('id', userIds);

        if (usersError) {
          console.error('Error fetching user details:', usersError);
          throw usersError;
        }

        return users || [];
      } catch (error: any) {
        console.error('Failed to fetch task assignees:', {
          error,
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
        });
        return [];
      }
    };

    // Helper function to fetch projects for the task
    const fetchTaskProjects = async () => {
      try {
        const { data: projectLinks, error } = await supabase
          .from('task_project_tasks')
          .select('project_id')
          .eq('task_id', task.id);

        if (error) {
          console.error('Error fetching project links:', error);
          throw error;
        }

        if (!projectLinks || projectLinks.length === 0) {
          console.log('No projects found for task');
          return [];
        }

        const projectIds = projectLinks
          .map((p: any) => p.project_id)
          .filter((id: any) => id != null);

        if (projectIds.length === 0) return [];

        const { data: projects, error: projectsError } = await supabase
          .from('task_projects')
          .select('id, name, status')
          .in('id', projectIds);

        if (projectsError) {
          console.error('Error fetching project details:', projectsError);
          throw projectsError;
        }

        return projects || [];
      } catch (error: any) {
        console.error('Failed to fetch task projects:', {
          error,
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
        });
        return [];
      }
    };

    // Subscribe to task changes (main task fields)
    const taskChannel = supabase
      .channel(`task-updates-${task.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${task.id}`,
        },
        async (payload) => {
          console.log('📥 Received realtime update for task:', payload);
          const updatedTask = payload.new as Task;

          // Update local state with changes from other users
          // Only update if no pending name update (avoid conflicts with debounced saves)
          if (!pendingNameRef.current && updatedTask.name !== name) {
            console.log(
              '📝 Updating task name from realtime:',
              updatedTask.name
            );
            setName(updatedTask.name);
          }

          // Update priority if changed
          if (updatedTask.priority !== priority) {
            console.log(
              '🚩 Updating priority from realtime:',
              updatedTask.priority
            );
            setPriority(updatedTask.priority ?? null);
          }

          // Update start date if changed
          const updatedStartDate = updatedTask.start_date
            ? new Date(updatedTask.start_date)
            : undefined;
          const currentStartDate = startDate?.toISOString();
          const newStartDate = updatedStartDate?.toISOString();
          if (currentStartDate !== newStartDate) {
            console.log(
              '📅 Updating start date from realtime:',
              updatedStartDate
            );
            setStartDate(updatedStartDate);
          }

          // Update end date if changed
          const updatedEndDate = updatedTask.end_date
            ? new Date(updatedTask.end_date)
            : undefined;
          const currentEndDate = endDate?.toISOString();
          const newEndDate = updatedEndDate?.toISOString();
          if (currentEndDate !== newEndDate) {
            console.log('📅 Updating end date from realtime:', updatedEndDate);
            setEndDate(updatedEndDate);
          }

          // Update estimation points if changed
          if (updatedTask.estimation_points !== estimationPoints) {
            console.log(
              '⏱️ Updating estimation points from realtime:',
              updatedTask.estimation_points
            );
            setEstimationPoints(updatedTask.estimation_points ?? null);
          }

          // Update list assignment if changed
          if (updatedTask.list_id !== selectedListId) {
            console.log('📋 Updating list from realtime:', updatedTask.list_id);
            setSelectedListId(updatedTask.list_id);
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status (tasks):', status);
      });

    // Subscribe to label changes
    const labelChannel = supabase
      .channel(`task-labels-${task.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_labels',
          filter: `task_id=eq.${task.id}`,
        },
        async () => {
          console.log('📥 Received realtime update for task labels');
          const labels = await fetchTaskLabels();
          console.log('🏷️ Updating labels from realtime:', labels);
          setSelectedLabels(labels);
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status (labels):', status);
      });

    // Subscribe to assignee changes
    const assigneeChannel = supabase
      .channel(`task-assignees-${task.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_assignees',
          filter: `task_id=eq.${task.id}`,
        },
        async () => {
          console.log('📥 Received realtime update for task assignees');
          const assignees = await fetchTaskAssignees();
          console.log('👥 Updating assignees from realtime:', assignees);
          setSelectedAssignees(assignees);
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status (assignees):', status);
      });

    // Subscribe to project changes
    const projectChannel = supabase
      .channel(`task-projects-${task.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_project_tasks',
          filter: `task_id=eq.${task.id}`,
        },
        async () => {
          console.log('📥 Received realtime update for task projects');
          const projects = await fetchTaskProjects();
          console.log('📦 Updating projects from realtime:', projects);
          setSelectedProjects(projects);
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status (projects):', status);
      });

    // Cleanup subscriptions on unmount or when task changes
    return () => {
      console.log('🧹 Cleaning up realtime subscriptions for task:', task.id);
      supabase.removeChannel(taskChannel);
      supabase.removeChannel(labelChannel);
      supabase.removeChannel(assigneeChannel);
      supabase.removeChannel(projectChannel);
    };
  }, [
    isCreateMode,
    isOpen,
    task?.id,
    name,
    priority,
    startDate,
    endDate,
    estimationPoints,
    selectedListId,
  ]);

  // ============================================================================
  // BOARD & WORKSPACE DATA - Board config, workspace ID, and lists
  // ============================================================================
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const { data: boardConfig } = useBoardConfig(boardId);
  const { data: availableLists = [] } = useQuery({
    queryKey: ['task_lists', boardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_lists')
        .select('*')
        .eq('board_id', boardId)
        .eq('deleted', false)
        .order('position')
        .order('created_at');

      if (error) throw error;
      return data as TaskList[];
    },
    enabled: !!boardId && isOpen && !propAvailableLists,
    initialData: propAvailableLists,
  });

  const estimationIndices: number[] = useMemo(() => {
    return boardConfig?.estimation_type
      ? buildEstimationIndices({
          extended: boardConfig?.extended_estimation,
          allowZero: boardConfig?.allow_zero_estimates,
        })
      : [];
  }, [
    boardConfig?.estimation_type,
    boardConfig?.extended_estimation,
    boardConfig?.allow_zero_estimates,
  ]);

  useEffect(() => {
    if (boardConfig?.ws_id && workspaceId !== boardConfig.ws_id) {
      setWorkspaceId(boardConfig.ws_id);
    }
  }, [boardConfig, workspaceId]);

  // ============================================================================
  // LABELS MANAGEMENT - Workspace labels, selected labels, and creation
  // ============================================================================
  const { data: workspaceLabelsData = [] } = useWorkspaceLabels(workspaceId);
  const [availableLabels, setAvailableLabels] = useState<WorkspaceTaskLabel[]>(
    []
  );
  const [selectedLabels, setSelectedLabels] = useState<WorkspaceTaskLabel[]>(
    task?.labels || []
  );

  // Label color utility functions
  const normalizeHex = (input: string): string | null => {
    if (!input) return null;
    let c = input.trim();
    if (c.startsWith('#')) c = c.slice(1);
    if (c.length === 3) {
      c = c
        .split('')
        .map((ch) => ch + ch)
        .join('');
    }
    if (c.length !== 6) return null;
    if (!/^[0-9a-fA-F]{6}$/.test(c)) return null;
    return `#${c.toLowerCase()}`;
  };

  const hexToRgb = (hex: string) => {
    const n = normalizeHex(hex);
    if (!n) return null;
    const r = parseInt(n.substring(1, 3), 16);
    const g = parseInt(n.substring(3, 5), 16);
    const b = parseInt(n.substring(5, 7), 16);
    return { r, g, b };
  };

  const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
    const channel = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };

  const adjust = (hex: string, factor: number) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const rN = rgb.r / 255;
    const gN = rgb.g / 255;
    const bN = rgb.b / 255;
    const max = Math.max(rN, gN, bN);
    const min = Math.min(rN, gN, bN);
    let h = 0;
    const l = (max + min) / 2;
    const d = max - min;
    let s = 0;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rN:
          h = (gN - bN) / d + (gN < bN ? 6 : 0);
          break;
        case gN:
          h = (bN - rN) / d + 2;
          break;
        default:
          h = (rN - gN) / d + 4;
      }
      h /= 6;
    }
    const targetL = Math.min(
      1,
      Math.max(0, l * (factor >= 1 ? 1 + (factor - 1) * 0.75 : factor))
    );
    const targetS = factor > 1 && targetL > 0.7 ? s * 0.85 : s;
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q =
      targetL < 0.5
        ? targetL * (1 + targetS)
        : targetL + targetS - targetL * targetS;
    const p = 2 * targetL - q;
    const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
    const g = Math.round(hue2rgb(p, q, h) * 255);
    const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  };

  const computeAccessibleLabelStyles = (raw: string) => {
    const nameMap: Record<string, string> = {
      red: '#ef4444',
      orange: '#f97316',
      amber: '#f59e0b',
      yellow: '#eab308',
      lime: '#84cc16',
      green: '#22c55e',
      emerald: '#10b981',
      teal: '#14b8a6',
      cyan: '#06b6d4',
      sky: '#0ea5e9',
      blue: '#3b82f6',
      indigo: '#6366f1',
      violet: '#8b5cf6',
      purple: '#a855f7',
      fuchsia: '#d946ef',
      pink: '#ec4899',
      rose: '#f43f5e',
      gray: '#6b7280',
      slate: '#64748b',
      zinc: '#71717a',
    };
    const baseHex = normalizeHex(raw) || nameMap[raw.toLowerCase?.()] || null;
    if (!baseHex) return null;
    const rgb = hexToRgb(baseHex);
    if (!rgb) return null;
    const lum = luminance(rgb);
    const bg = `${baseHex}1a`;
    const border = `${baseHex}4d`;
    let text = baseHex;
    if (lum < 0.22) {
      text = adjust(baseHex, 1.25);
    } else if (lum > 0.82) {
      text = adjust(baseHex, 0.65);
    }
    return { bg, border, text };
  };

  useEffect(() => {
    if (workspaceLabelsData.length > 0) {
      setAvailableLabels(workspaceLabelsData);
    }
  }, [workspaceLabelsData]);

  // ============================================================================
  // ASSIGNEES & MEMBERS - Workspace members and task assignees
  // ============================================================================
  const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<any[]>(
    task?.assignees || []
  );

  const fetchWorkspaceMembers = useCallback(async (wsId: string) => {
    try {
      const { data: members, error } = await supabase
        .from('workspace_members')
        .select(
          `
          user_id,
          users!inner(
            id,
            display_name,
            avatar_url
          )
        `
        )
        .eq('ws_id', wsId);

      if (error) {
        console.error('Error fetching workspace members:', error);
        throw error;
      }

      if (members) {
        const transformedMembers = members.map((m: any) => ({
          user_id: m.user_id,
          display_name: m.users?.display_name || 'Unknown User',
          avatar_url: m.users?.avatar_url,
        }));

        const uniqueMembers = Array.from(
          new Map(transformedMembers.map((m) => [m.user_id, m])).values()
        );

        const sortedMembers = uniqueMembers.sort((a, b) =>
          (a.display_name || '').localeCompare(b.display_name || '')
        );
        setWorkspaceMembers(sortedMembers);
      }
    } catch (e) {
      console.error('Failed fetching workspace members', e);
    }
  }, []);

  // ============================================================================
  // PROJECTS - Task projects and selection
  // ============================================================================
  const [taskProjects, setTaskProjects] = useState<any[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<any[]>(
    task?.projects || []
  );

  const fetchTaskProjects = useCallback(async (wsId: string) => {
    try {
      const { data: projects, error } = await supabase
        .from('task_projects')
        .select('id, name, status')
        .eq('ws_id', wsId)
        .eq('deleted', false)
        .order('name');

      if (error) {
        console.error('Error fetching task projects:', error);
        throw error;
      }

      if (projects) {
        setTaskProjects(projects);
      }
    } catch (e) {
      console.error('Failed fetching task projects', e);
    }
  }, []);

  // ============================================================================
  // WORKSPACE & TASKS DATA - All workspaces and workspace tasks for mentions
  // ============================================================================
  const [, setWorkspaceDetails] = useState<any | null>(null);
  const [workspaceDetailsLoading, setWorkspaceDetailsLoading] = useState(false);
  const [allWorkspaces, setAllWorkspaces] = useState<any[]>([]);
  const [allWorkspacesLoading, setAllWorkspacesLoading] = useState(false);
  const [workspaceTasks, setWorkspaceTasks] = useState<any[]>([]);
  const [workspaceTasksLoading, setWorkspaceTasksLoading] = useState(false);
  const [taskSearchQuery, setTaskSearchQuery] = useState<string>('');

  const taskSearchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAllWorkspaces = useCallback(async () => {
    try {
      setAllWorkspacesLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from('workspaces')
        .select('id, name, handle, personal, workspace_members!inner(user_id)')
        .eq('workspace_members.user_id', user.id);

      if (error) throw error;

      setAllWorkspaces(data || []);
    } catch (error) {
      console.error('Failed fetching all workspaces', error);
    } finally {
      setAllWorkspacesLoading(false);
    }
  }, []);

  const fetchWorkspaceDetails = useCallback(async (wsId: string) => {
    if (!wsId) return;
    try {
      setWorkspaceDetailsLoading(true);
      const { data, error } = await supabase
        .from('workspaces')
        .select('id, name, handle')
        .eq('id', wsId)
        .single();

      if (error) throw error;
      setWorkspaceDetails(data || null);
    } catch (error) {
      console.error('Failed fetching workspace details', error);
    } finally {
      setWorkspaceDetailsLoading(false);
    }
  }, []);

  const fetchWorkspaceTasks = useCallback(
    async (wsId: string, searchQuery?: string) => {
      if (!wsId) return;
      try {
        setWorkspaceTasksLoading(true);

        const { data: boards, error: boardsError } = await supabase
          .from('workspace_boards')
          .select('id')
          .eq('ws_id', wsId);

        if (boardsError) throw boardsError;

        const boardIds = (
          (boards || []) as {
            id: string;
          }[]
        ).map((b: { id: string }) => b.id);
        if (boardIds.length === 0) {
          setWorkspaceTasks([]);
          return;
        }

        let query = supabase
          .from('tasks')
          .select(
            `
          id,
          name,
          priority,
          created_at,
          list:task_lists!inner(id, name, board_id)
        `
          )
          .in('task_lists.board_id', boardIds)
          .is('deleted_at', null);

        if (searchQuery?.trim()) {
          query = query.ilike('name', `%${searchQuery.trim()}%`);
        }

        const { data, error } = await query
          .order('created_at', { ascending: false })
          .limit(searchQuery ? 50 : 25);

        if (error) throw error;
        setWorkspaceTasks(data || []);
      } catch (error) {
        console.error('Failed fetching workspace tasks', error);
      } finally {
        setWorkspaceTasksLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!workspaceId) {
      setWorkspaceDetails(null);
      setWorkspaceTasks([]);
      setAllWorkspaces([]);
    }
  }, [workspaceId]);

  // ============================================================================
  // EDITOR & SUGGESTIONS - Rich text editor and slash/mention menus
  // ============================================================================
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [slashState, setSlashState] = useState<SuggestionState>(
    createInitialSuggestionState
  );
  const [mentionState, setMentionState] = useState<SuggestionState>(
    createInitialSuggestionState
  );
  const [slashHighlightIndex, setSlashHighlightIndex] = useState(0);
  const [mentionHighlightIndex, setMentionHighlightIndex] = useState(0);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(true);

  // Dropdown open states for controlled closing behavior
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  // Popover states for inline metadata badges
  const [isPriorityPopoverOpen, setIsPriorityPopoverOpen] = useState(false);
  const [isDueDatePopoverOpen, setIsDueDatePopoverOpen] = useState(false);
  const [isEstimationPopoverOpen, setIsEstimationPopoverOpen] = useState(false);
  const [isLabelsPopoverOpen, setIsLabelsPopoverOpen] = useState(false);
  const [isProjectsPopoverOpen, setIsProjectsPopoverOpen] = useState(false);
  const [isAssigneesPopoverOpen, setIsAssigneesPopoverOpen] = useState(false);
  const [isListPopoverOpen, setIsListPopoverOpen] = useState(false);

  // Metadata section collapse state
  const [isMetadataExpanded, setIsMetadataExpanded] = useState(true);

  const slashListRef = useRef<HTMLDivElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const previousMentionHighlightRef = useRef(0);
  const previousSlashHighlightRef = useRef(0);
  const previousSlashQueryRef = useRef('');
  const previousMentionQueryRef = useRef('');

  const suggestionMenuWidth = 360;

  const slashCommands = useMemo<SlashCommandDefinition[]>(() => {
    return getSlashCommands({
      hasMembers: workspaceMembers.length > 0,
      hasEndDate: !!endDate,
      hasPriority: !!priority,
      showAdvanced: showAdvancedOptions,
    });
  }, [workspaceMembers.length, endDate, priority, showAdvancedOptions]);

  const filteredSlashCommands = useMemo(() => {
    if (!slashState.open) return [] as SlashCommandDefinition[];
    return filterSlashCommands(slashCommands, slashState.query);
  }, [slashCommands, slashState.open, slashState.query]);

  const { filteredMentionOptions } = useMentionSuggestions({
    workspaceMembers,
    allWorkspaces,
    taskProjects,
    workspaceTasks,
    currentTaskId: task?.id,
    query: mentionState.query,
  });

  const closeSlashMenu = useCallback(() => {
    setSlashState((prev) =>
      prev.open ? createInitialSuggestionState() : prev
    );
  }, []);

  const closeMentionMenu = useCallback(() => {
    setMentionState((prev) =>
      prev.open ? createInitialSuggestionState() : prev
    );
    setShowCustomDatePicker(false);
    setCustomDate(undefined);
    setIncludeTime(false);
    setSelectedHour('11');
    setSelectedMinute('59');
    setSelectedPeriod('PM');
  }, []);

  const handleEditorReady = useCallback((editor: Editor) => {
    setEditorInstance(editor);
  }, []);

  // ============================================================================
  // CUSTOM DATE PICKER - Date picker state for mention menu
  // ============================================================================
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [includeTime, setIncludeTime] = useState(false);
  const [selectedHour, setSelectedHour] = useState<string>('11');
  const [selectedMinute, setSelectedMinute] = useState<string>('59');
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>('PM');

  // ============================================================================
  // UI STATE - Dialog and options visibility
  // ============================================================================
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [createMultiple, setCreateMultiple] = useState(false);
  const [showSyncWarning, setShowSyncWarning] = useState(false);

  // ============================================================================
  // DRAFT PERSISTENCE - Auto-save drafts in create mode
  // ============================================================================
  const [hasDraft, setHasDraft] = useState(false);

  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNameRef = useRef<string | null>(null);

  const draftStorageKey = useMemo(
    () => `tu-do:task-draft:${boardId}`,
    [boardId]
  );

  // ============================================================================
  // HANDLER REFS - Stable refs for callbacks used in effects
  // ============================================================================
  const handleSaveRef = useRef<() => void>(() => {});
  const handleCloseRef = useRef<() => void>(() => {});
  const hasUnsavedChangesRef = useRef<boolean>(false);
  const quickDueRef = useRef<(days: number | null) => void>(() => {});
  const updateEstimationRef = useRef<(points: number | null) => void>(() => {});
  const handleConvertToTaskRef = useRef<(() => Promise<void>) | null>(null);
  const flushNameUpdateRef = useRef<(() => Promise<void>) | null>(null);

  // ============================================================================
  // CHANGE DETECTION - Track unsaved changes for save button state
  // ============================================================================
  const parseDescription = useCallback((desc?: string): JSONContent | null => {
    if (!desc) return null;
    try {
      return JSON.parse(desc);
    } catch {
      return {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: desc }],
          },
        ],
      };
    }
  }, []);

  const initialSnapshot = useMemo(() => {
    return {
      name: (task?.name || '').trim(),
      description: JSON.stringify(parseDescription(task?.description) || null),
      priority: task?.priority || null,
      start: task?.start_date
        ? new Date(task?.start_date).toISOString()
        : undefined,
      end: task?.end_date ? new Date(task?.end_date).toISOString() : undefined,
      listId: task?.list_id,
      estimationPoints: task?.estimation_points ?? null,
    } as const;
  }, [task, parseDescription]);

  const currentSnapshot = useMemo(() => {
    return {
      name: (name || '').trim(),
      description: JSON.stringify(description || null),
      priority: priority || null,
      start: startDate?.toISOString(),
      end: endDate?.toISOString(),
      listId: selectedListId,
      estimationPoints: estimationPoints ?? null,
    } as const;
  }, [
    name,
    description,
    priority,
    startDate,
    endDate,
    selectedListId,
    estimationPoints,
  ]);

  const hasUnsavedChanges = useMemo(() => {
    // When collaboration is enabled, description is managed by Yjs - don't track it
    const descriptionChanged = collaborationMode
      ? false
      : initialSnapshot.description !== currentSnapshot.description;

    return (
      initialSnapshot.name !== currentSnapshot.name ||
      descriptionChanged ||
      initialSnapshot.priority !== currentSnapshot.priority ||
      initialSnapshot.start !== currentSnapshot.start ||
      initialSnapshot.end !== currentSnapshot.end ||
      initialSnapshot.listId !== currentSnapshot.listId ||
      initialSnapshot.estimationPoints !== currentSnapshot.estimationPoints
    );
  }, [initialSnapshot, currentSnapshot, collaborationMode]);

  const canSave = useMemo(() => {
    const hasName = !!(name || '').trim();
    if (isCreateMode) return hasName && !isLoading;
    return hasName && hasUnsavedChanges && !isLoading;
  }, [isCreateMode, name, hasUnsavedChanges, isLoading]);

  // ============================================================================
  // EVENT HANDLERS - Core event handlers (dates, estimation, labels, etc.)
  // ============================================================================
  const handleQuickDueDate = useCallback(
    (days: number | null) => {
      let newDate: Date | undefined;
      if (days !== null) {
        newDate = dayjs().add(days, 'day').endOf('day').toDate();
      }
      setEndDate(newDate);
      if (isCreateMode) {
        return;
      }
      setIsLoading(true);
      const taskUpdates: Partial<Task> = {
        end_date: newDate ? newDate.toISOString() : null,
      };

      if (task?.id)
        updateTaskMutation.mutate(
          { taskId: task?.id, updates: taskUpdates },
          {
            onSuccess: async () => {
              await invalidateTaskCaches(queryClient, boardId);

              if (boardId) {
                await queryClient.refetchQueries({
                  queryKey: ['tasks', boardId],
                  type: 'active',
                });
              }

              toast({
                title: 'Due date updated',
                description: newDate
                  ? `Due date set to ${newDate.toLocaleDateString()}`
                  : 'Due date removed',
              });
              onUpdate();
            },
            onError: (error: any) => {
              console.error('Error updating due date:', error);
              toast({
                title: 'Error updating due date',
                description: error.message || 'Please try again later',
                variant: 'destructive',
              });
            },
            onSettled: () => setIsLoading(false),
          }
        );
    },
    [
      isCreateMode,
      onUpdate,
      queryClient,
      task,
      updateTaskMutation,
      boardId,
      toast,
    ]
  );

  const updateEstimation = useCallback(
    async (points: number | null) => {
      if (points === estimationPoints) return;
      setEstimationPoints(points);
      if (isCreateMode || !task?.id || task?.id === 'new') {
        return;
      }
      setEstimationSaving(true);
      try {
        const { error } = await supabase
          .from('tasks')
          .update({ estimation_points: points })
          .eq('id', task.id);
        if (error) throw error;
        await invalidateTaskCaches(queryClient, boardId);
      } catch (e: any) {
        console.error('Failed updating estimation', e);
        toast({
          title: 'Failed to update estimation',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      } finally {
        setEstimationSaving(false);
      }
    },
    [estimationPoints, isCreateMode, task?.id, queryClient, boardId, toast]
  );

  const updatePriority = useCallback(
    async (newPriority: TaskPriority | null) => {
      if (newPriority === priority) return;
      setPriority(newPriority);
      if (isCreateMode || !task?.id || task?.id === 'new') {
        return;
      }
      try {
        const { error } = await supabase
          .from('tasks')
          .update({ priority: newPriority })
          .eq('id', task.id);
        if (error) throw error;
        await invalidateTaskCaches(queryClient, boardId);
      } catch (e: any) {
        console.error('Failed updating priority', e);
        toast({
          title: 'Failed to update priority',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [priority, isCreateMode, task?.id, queryClient, boardId, toast]
  );

  const updateStartDate = useCallback(
    async (newDate: Date | undefined) => {
      setStartDate(newDate);
      if (isCreateMode || !task?.id || task?.id === 'new') {
        return;
      }
      try {
        const { error } = await supabase
          .from('tasks')
          .update({ start_date: newDate ? newDate.toISOString() : null })
          .eq('id', task.id);
        if (error) throw error;
        await invalidateTaskCaches(queryClient, boardId);
      } catch (e: any) {
        console.error('Failed updating start date', e);
        toast({
          title: 'Failed to update start date',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [isCreateMode, task?.id, queryClient, boardId, toast]
  );

  const updateEndDate = useCallback(
    async (newDate: Date | undefined) => {
      setEndDate(newDate);
      if (isCreateMode || !task?.id || task?.id === 'new') {
        return;
      }
      try {
        const { error } = await supabase
          .from('tasks')
          .update({ end_date: newDate ? newDate.toISOString() : null })
          .eq('id', task.id);
        if (error) throw error;
        await invalidateTaskCaches(queryClient, boardId);
      } catch (e: any) {
        console.error('Failed updating end date', e);
        toast({
          title: 'Failed to update end date',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [isCreateMode, task?.id, queryClient, boardId, toast]
  );

  const updateList = useCallback(
    async (newListId: string) => {
      if (newListId === selectedListId) return;
      setSelectedListId(newListId);
      if (isCreateMode || !task?.id || task?.id === 'new') {
        return;
      }
      try {
        const { error } = await supabase
          .from('tasks')
          .update({ list_id: newListId })
          .eq('id', task.id);
        if (error) throw error;
        await invalidateTaskCaches(queryClient, boardId);
        toast({
          title: 'List updated',
          description: 'Task moved to new list',
        });
        onUpdate();
      } catch (e: any) {
        console.error('Failed updating list', e);
        toast({
          title: 'Failed to update list',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [
      selectedListId,
      isCreateMode,
      task?.id,
      queryClient,
      boardId,
      toast,
      onUpdate,
    ]
  );

  const handleEndDateChange = useCallback(
    (date: Date | undefined) => {
      if (date) {
        let selectedDate = dayjs(date);
        if (
          selectedDate.hour() === 0 &&
          selectedDate.minute() === 0 &&
          selectedDate.second() === 0 &&
          selectedDate.millisecond() === 0
        ) {
          selectedDate = selectedDate.endOf('day');
        }
        updateEndDate(selectedDate.toDate());
      } else {
        updateEndDate(undefined);
      }
    },
    [updateEndDate]
  );

  const saveNameToDatabase = useCallback(
    async (newName: string) => {
      const trimmedName = newName.trim();
      if (!trimmedName || trimmedName === (task?.name || '').trim()) return;

      if (isCreateMode || !task?.id || task?.id === 'new') {
        return;
      }

      try {
        const { error } = await supabase
          .from('tasks')
          .update({ name: trimmedName })
          .eq('id', task.id);
        if (error) throw error;
        await invalidateTaskCaches(queryClient, boardId);
      } catch (e: any) {
        console.error('Failed updating task name', e);
        toast({
          title: 'Failed to update task name',
          description: e.message || 'Please try again',
          variant: 'destructive',
        });
      }
    },
    [task?.name, task?.id, isCreateMode, queryClient, boardId, toast]
  );

  const updateName = useCallback(
    (newName: string) => {
      // Clear any pending save
      if (nameUpdateTimerRef.current) {
        clearTimeout(nameUpdateTimerRef.current);
      }

      // Store the pending name
      pendingNameRef.current = newName;

      // Schedule debounced save (1 second delay)
      nameUpdateTimerRef.current = setTimeout(() => {
        saveNameToDatabase(newName);
        pendingNameRef.current = null;
        nameUpdateTimerRef.current = null;
      }, 1000);
    },
    [saveNameToDatabase]
  );

  const flushNameUpdate = useCallback(async () => {
    // Clear the debounce timer
    if (nameUpdateTimerRef.current) {
      clearTimeout(nameUpdateTimerRef.current);
      nameUpdateTimerRef.current = null;
    }

    // Save immediately if there's a pending name
    if (pendingNameRef.current) {
      await saveNameToDatabase(pendingNameRef.current);
      pendingNameRef.current = null;
    }
  }, [saveNameToDatabase]);

  const handleImageUpload = useCallback(
    async (file: File): Promise<string> => {
      if (!workspaceId) {
        throw new Error('Workspace ID not found');
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${workspaceId}/task-images/${fileName}`;

      const { data, error } = await supabase.storage
        .from('workspaces')
        .upload(filePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (error) {
        console.error('Upload error:', error);
        throw new Error('Failed to upload image');
      }

      const { data: signedUrlData, error: signedUrlError } =
        await supabase.storage
          .from('workspaces')
          .createSignedUrl(data.path, 31536000);

      if (signedUrlError) {
        console.error('Signed URL error:', signedUrlError);
        throw new Error('Failed to generate signed URL');
      }

      return signedUrlData.signedUrl;
    },
    [workspaceId]
  );

  const toggleLabel = useCallback(
    async (label: WorkspaceTaskLabel) => {
      const exists = selectedLabels.some((l) => l.id === label.id);
      try {
        if (isCreateMode) {
          setSelectedLabels((prev) =>
            exists ? prev.filter((l) => l.id !== label.id) : [label, ...prev]
          );
          return;
        }
        if (exists) {
          if (!task?.id) return;
          const { error } = await supabase
            .from('task_labels')
            .delete()
            .eq('task_id', task.id)
            .eq('label_id', label.id);
          if (error) throw error;
          setSelectedLabels((prev) => prev.filter((l) => l.id !== label.id));
        } else {
          if (!task?.id) return;
          const { error } = await supabase
            .from('task_labels')
            .insert({ task_id: task.id, label_id: label.id });
          if (error) throw error;
          setSelectedLabels((prev) =>
            [label, ...prev].sort((a, b) => {
              const aName = a?.name || '';
              const bName = b?.name || '';
              return aName.toLowerCase().localeCompare(bName.toLowerCase());
            })
          );
        }
        await invalidateTaskCaches(queryClient, boardId);
      } catch (e: any) {
        toast({
          title: 'Label update failed',
          description: e.message || 'Unable to update labels',
          variant: 'destructive',
        });
      }
    },
    [selectedLabels, isCreateMode, task?.id, boardId, queryClient, toast]
  );

  const toggleAssignee = useCallback(
    async (member: any) => {
      // selectedAssignees has 'id' property, workspaceMembers has 'user_id' property
      const userId = member.user_id || member.id;
      const exists = selectedAssignees.some(
        (a) => (a.id || a.user_id) === userId
      );
      try {
        if (isCreateMode) {
          setSelectedAssignees((prev) =>
            exists
              ? prev.filter((a) => (a.id || a.user_id) !== userId)
              : [...prev, member]
          );
          return;
        }
        if (exists) {
          if (!task?.id) return;
          const { error } = await supabase
            .from('task_assignees')
            .delete()
            .eq('task_id', task.id)
            .eq('user_id', userId);
          if (error) throw error;
          setSelectedAssignees((prev) =>
            prev.filter((a) => (a.id || a.user_id) !== userId)
          );
        } else {
          if (!task?.id) return;
          const { error } = await supabase
            .from('task_assignees')
            .insert({ task_id: task.id, user_id: userId });
          if (error) throw error;
          setSelectedAssignees((prev) => [...prev, member]);
        }
        await invalidateTaskCaches(queryClient, boardId);
        onUpdate();
      } catch (e: any) {
        toast({
          title: 'Assignee update failed',
          description: e.message || 'Unable to update assignees',
          variant: 'destructive',
        });
      }
    },
    [
      isCreateMode,
      selectedAssignees,
      task?.id,
      boardId,
      queryClient,
      onUpdate,
      toast,
    ]
  );

  const toggleProject = useCallback(
    async (project: any) => {
      const exists = selectedProjects.some((p) => p.id === project.id);
      try {
        if (isCreateMode) {
          setSelectedProjects((prev) =>
            exists
              ? prev.filter((p) => p.id !== project.id)
              : [...prev, project]
          );
          return;
        }
        if (exists) {
          if (!task?.id) return;
          const { error } = await supabase
            .from('task_project_tasks')
            .delete()
            .eq('task_id', task.id)
            .eq('project_id', project.id);
          if (error) throw error;
          setSelectedProjects((prev) =>
            prev.filter((p) => p.id !== project.id)
          );
        } else {
          if (!task?.id) return;
          const { error } = await supabase
            .from('task_project_tasks')
            .insert({ task_id: task.id, project_id: project.id });

          if (error) {
            if (error.code === '23505') {
              toast({
                title: 'Already linked',
                description: 'This project is already linked to the task',
              });
              await invalidateTaskCaches(queryClient, boardId);
              onUpdate();
              return;
            }
            throw error;
          }
          setSelectedProjects((prev) => [...prev, project]);
        }
        await invalidateTaskCaches(queryClient, boardId);
        onUpdate();
      } catch (e: any) {
        toast({
          title: 'Project update failed',
          description: e.message || 'Unable to update projects',
          variant: 'destructive',
        });
      }
    },
    [
      selectedProjects,
      isCreateMode,
      task?.id,
      queryClient,
      boardId,
      onUpdate,
      toast,
    ]
  );

  const executeSlashCommand = useCallback(
    (command: SlashCommandDefinition) => {
      if (!editorInstance) return;

      const range = slashState.range;
      const baseChain = editorInstance.chain().focus();
      if (range) {
        baseChain.deleteRange(range);
      }
      baseChain.run();

      closeSlashMenu();

      switch (command.id) {
        case 'assign':
          editorInstance.chain().focus().insertContent('@').run();
          return;
        case 'due-today':
          handleQuickDueDate(0);
          return;
        case 'due-tomorrow':
          handleQuickDueDate(1);
          return;
        case 'due-next-week':
          handleQuickDueDate(7);
          return;
        case 'clear-due':
          handleQuickDueDate(null);
          return;
        case 'priority-critical':
          setPriority('critical');
          return;
        case 'priority-high':
          setPriority('high');
          return;
        case 'priority-normal':
          setPriority('normal');
          return;
        case 'priority-low':
          setPriority('low');
          return;
        case 'priority-clear':
          setPriority(null);
          return;
        case 'toggle-advanced':
          setShowAdvancedOptions((prev) => !prev);
          return;
        case 'convert-to-task':
          setTimeout(() => {
            handleConvertToTaskRef.current?.();
          }, 0);
          return;
        default:
          return;
      }
    },
    [editorInstance, slashState.range, closeSlashMenu, handleQuickDueDate]
  );

  const insertMentionOption = useCallback(
    (option: MentionOption) => {
      if (!editorInstance) return;

      if (option.id === 'custom-date') {
        setShowCustomDatePicker(true);
        return;
      }

      const chain = editorInstance.chain().focus();
      if (mentionState.range) {
        chain.deleteRange(mentionState.range);
      }

      chain
        .insertContent([
          {
            type: 'mention',
            attrs: {
              userId: option.type === 'user' ? option.id : null,
              entityId: option.id,
              entityType: option.type,
              displayName: option.label,
              avatarUrl: option.avatarUrl ?? null,
              subtitle: option.subtitle ?? null,
            },
          },
          { type: 'text', text: ' ' },
        ])
        .run();

      closeMentionMenu();
    },
    [editorInstance, mentionState.range, closeMentionMenu]
  );

  const handleCustomDateSelect = useCallback(
    (date: Date | undefined) => {
      if (!editorInstance || !date) return;

      let finalDate = dayjs(date);
      let formattedDate = finalDate.format('MMM D, YYYY');

      if (includeTime) {
        const hourVal = parseInt(selectedHour || '12', 10);
        const minuteVal = parseInt(selectedMinute || '0', 10);

        let hour = hourVal;
        if (selectedPeriod === 'PM' && hour !== 12) {
          hour += 12;
        } else if (selectedPeriod === 'AM' && hour === 12) {
          hour = 0;
        }

        finalDate = finalDate
          .hour(hour)
          .minute(minuteVal)
          .second(0)
          .millisecond(0);
        formattedDate = finalDate.format('MMM D, YYYY h:mm A');
      }

      const chain = editorInstance.chain().focus();

      if (mentionState.range) {
        chain.deleteRange(mentionState.range);
      }

      chain
        .insertContent([
          {
            type: 'mention',
            attrs: {
              userId: null,
              entityId: `custom-${finalDate.toISOString()}`,
              entityType: 'date',
              displayName: formattedDate,
              avatarUrl: null,
              subtitle: null,
            },
          },
          { type: 'text', text: ' ' },
        ])
        .run();

      setShowCustomDatePicker(false);
      setCustomDate(undefined);
      setIncludeTime(false);
      setSelectedHour('12');
      setSelectedMinute('00');
      setSelectedPeriod('PM');
      closeMentionMenu();
    },
    [
      editorInstance,
      mentionState.range,
      closeMentionMenu,
      includeTime,
      selectedHour,
      selectedMinute,
      selectedPeriod,
    ]
  );

  const handleConvertToTask = useCallback(async () => {
    if (!editorInstance || !boardId || !availableLists) return;

    const firstList = availableLists[0];
    if (!firstList) {
      toast({
        title: 'No lists available',
        description: 'Create a list first before converting items to tasks',
        variant: 'destructive',
      });
      return;
    }

    const result = await convertListItemToTask({
      editor: editorInstance,
      listId: firstList.id,
      listName: firstList.name,
      wrapInParagraph: false,
      createTask: async ({
        name,
        listId,
      }: {
        name: string;
        listId: string;
      }) => {
        const { data: newTask, error } = await supabase
          .from('tasks')
          .insert({
            name,
            list_id: listId,
          })
          .select('id, name')
          .single();

        if (error || !newTask) throw error;
        return newTask;
      },
    });

    if (!result.success) {
      toast({
        title: result.error!.message,
        description: result.error!.description,
        variant: 'destructive',
      });
      return;
    }

    await invalidateTaskCaches(queryClient, boardId);

    toast({
      title: 'Task created',
      description: `Created task "${result.taskName}" and added mention`,
    });
  }, [editorInstance, boardId, availableLists, queryClient, toast]);

  const handleSave = useCallback(async () => {
    if (!name?.trim()) return;

    // Clear any pending name update timer since we're saving now
    if (nameUpdateTimerRef.current) {
      clearTimeout(nameUpdateTimerRef.current);
      nameUpdateTimerRef.current = null;
      pendingNameRef.current = null;
    }

    let currentDescription = description;
    if (flushEditorPendingRef.current) {
      const flushedContent = flushEditorPendingRef.current();
      if (flushedContent) {
        currentDescription = flushedContent;
      }
    }

    setIsSaving(true);
    setIsLoading(true);

    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    try {
      if (typeof window !== 'undefined')
        localStorage.removeItem(draftStorageKey);
      setHasDraft(false);
    } catch {}

    let descriptionString: string | null = null;
    if (currentDescription) {
      try {
        descriptionString = JSON.stringify(currentDescription);
      } catch (serializationError) {
        console.error('Failed to serialize description:', serializationError);
        descriptionString = null;
      }
    }

    if (isCreateMode) {
      try {
        const { createTask } = await import('@tuturuuu/utils/task-helper');
        const taskData: Partial<Task> = {
          name: name.trim(),
          description: descriptionString,
          priority: priority,
          start_date: startDate ? startDate.toISOString() : null,
          end_date: endDate ? endDate.toISOString() : null,
          estimation_points: estimationPoints ?? null,
        } as any;
        const newTask = await createTask(supabase, selectedListId, taskData);

        if (selectedLabels.length > 0) {
          await supabase.from('task_labels').insert(
            selectedLabels.map((l) => ({
              task_id: newTask.id,
              label_id: l.id,
            }))
          );
        }

        if (selectedAssignees.length > 0) {
          await supabase.from('task_assignees').insert(
            selectedAssignees.map((a) => ({
              task_id: newTask.id,
              user_id: a.user_id,
            }))
          );
        }

        if (selectedProjects.length > 0) {
          await supabase.from('task_project_tasks').insert(
            selectedProjects.map((p) => ({
              task_id: newTask.id,
              project_id: p.id,
            }))
          );
        }

        await invalidateTaskCaches(queryClient, boardId);
        toast({ title: 'Task created', description: 'New task added.' });
        onUpdate();
        if (createMultiple) {
          setName('');
          setDescription(null);
          setTimeout(() => {
            const input = document.querySelector<HTMLInputElement>(
              'input[placeholder="What needs to be done?"]'
            );
            input?.focus();
          }, 0);
        } else {
          setName('');
          setDescription(null);
          setPriority(null);
          setStartDate(undefined);
          setEndDate(undefined);
          setEstimationPoints(null);
          setSelectedLabels([]);
          onClose();
        }
      } catch (error: any) {
        console.error('Error creating task:', error);
        toast({
          title: 'Error creating task',
          description: error.message || 'Please try again later',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
        setIsSaving(false);
      }
      return;
    }

    // When collaboration is enabled, get description from Yjs for embeddings
    const taskUpdates: any = {
      name: name.trim(),
      priority: priority,
      start_date: startDate ? startDate.toISOString() : null,
      end_date: endDate ? endDate.toISOString() : null,
      list_id: selectedListId,
      estimation_points: estimationPoints ?? null,
    };

    // Always update description field for embeddings and calculations
    // In collaboration mode, get the current state from Yjs
    // In non-collaboration mode, use the local description state
    if (collaborationMode && flushEditorPendingRef.current) {
      const yjsDescription = flushEditorPendingRef.current();
      taskUpdates.description = yjsDescription
        ? JSON.stringify(yjsDescription)
        : null;
    } else {
      taskUpdates.description = descriptionString;
    }

    if (task?.id) {
      // Close dialog immediately for better UX
      onClose();

      updateTaskMutation.mutate(
        {
          taskId: task.id,
          updates: taskUpdates,
        },
        {
          onSuccess: async () => {
            console.log('Task update successful, refreshing data...');

            // Update caches and refetch in background
            invalidateTaskCaches(queryClient, boardId);
            queryClient.refetchQueries({
              queryKey: ['tasks', boardId],
              type: 'active',
            });

            toast({
              title: 'Task updated',
              description: 'The task has been successfully updated.',
            });
            onUpdate();
          },
          onError: (error: any) => {
            console.error('Error updating task:', error);
            toast({
              title: 'Error updating task',
              description: error.message || 'Please try again later',
              variant: 'destructive',
            });
            // Reopen dialog on error so user can retry
            // Note: This won't work well, consider showing error differently
          },
          onSettled: () => {
            setIsLoading(false);
            setIsSaving(false);
          },
        }
      );
    }
  }, [
    name,
    description,
    draftStorageKey,
    isCreateMode,
    priority,
    startDate,
    endDate,
    estimationPoints,
    selectedListId,
    selectedLabels,
    selectedAssignees,
    selectedProjects,
    queryClient,
    boardId,
    toast,
    onUpdate,
    createMultiple,
    onClose,
    task?.id,
    updateTaskMutation,
    collaborationMode,
  ]);

  const handleClose = useCallback(async () => {
    if (isLoading) return;

    // Flush any pending name update before closing
    await flushNameUpdate();

    // Check if we're in collaboration mode and not synced
    if (collaborationMode && !isCreateMode && (!synced || !connected)) {
      setShowSyncWarning(true);
      return;
    }

    // Save Yjs description to database for embeddings and calculations
    if (
      collaborationMode &&
      !isCreateMode &&
      task?.id &&
      flushEditorPendingRef.current
    ) {
      await saveYjsDescriptionToDatabase({
        taskId: task.id,
        getContent: flushEditorPendingRef.current,
        boardId,
        queryClient,
        context: 'close',
      });
    }

    // Safe to close
    try {
      if (!isCreateMode && typeof window !== 'undefined') {
        localStorage.removeItem(draftStorageKey);
      }
    } catch {}
    onClose();
  }, [
    isLoading,
    flushNameUpdate,
    collaborationMode,
    isCreateMode,
    synced,
    connected,
    draftStorageKey,
    onClose,
    task?.id,
    boardId,
    queryClient,
  ]);

  const handleForceClose = useCallback(async () => {
    setShowSyncWarning(false);
    // Flush any pending name update before force closing
    await flushNameUpdate();

    // Save Yjs description to database for embeddings and calculations
    if (
      collaborationMode &&
      !isCreateMode &&
      task?.id &&
      flushEditorPendingRef.current
    ) {
      await saveYjsDescriptionToDatabase({
        taskId: task.id,
        getContent: flushEditorPendingRef.current,
        boardId,
        queryClient,
        context: 'force-close',
      });
    }

    try {
      if (!isCreateMode && typeof window !== 'undefined') {
        localStorage.removeItem(draftStorageKey);
      }
    } catch {}
    onClose();
  }, [
    isCreateMode,
    draftStorageKey,
    onClose,
    flushNameUpdate,
    collaborationMode,
    task?.id,
    boardId,
    queryClient,
  ]);

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (
        !open &&
        !showCustomDatePicker &&
        !slashState.open &&
        !mentionState.open
      ) {
        handleClose();
      }
    },
    [showCustomDatePicker, slashState.open, mentionState.open, handleClose]
  );

  // ============================================================================
  // EFFECTS - Side effects for data fetching, state synchronization, etc.
  // ============================================================================

  // Auto-close sync warning dialog when sync completes
  useEffect(() => {
    if (showSyncWarning && synced && connected) {
      // Give a brief moment for user to see the success state
      const timer = setTimeout(async () => {
        setShowSyncWarning(false);
        // Flush any pending name update before closing
        await flushNameUpdate();

        // Save Yjs description to database for embeddings and calculations
        if (
          collaborationMode &&
          !isCreateMode &&
          task?.id &&
          flushEditorPendingRef.current
        ) {
          await saveYjsDescriptionToDatabase({
            taskId: task.id,
            getContent: flushEditorPendingRef.current,
            boardId,
            queryClient,
            context: 'auto-close',
          });
        }

        // Now safe to close - proceed with the actual close
        try {
          if (!isCreateMode && typeof window !== 'undefined') {
            localStorage.removeItem(draftStorageKey);
          }
        } catch {}
        onClose();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [
    showSyncWarning,
    synced,
    connected,
    flushNameUpdate,
    isCreateMode,
    draftStorageKey,
    onClose,
    collaborationMode,
    task?.id,
    boardId,
    queryClient,
  ]);

  // Initialize Yjs state for task description if not present
  useEffect(() => {
    if (!task?.id || !editorInstance?.schema || !description || !doc) return;

    const initializeYjsState = async () => {
      try {
        const { data: taskData, error: taskDataError } = await supabase
          .from('tasks')
          .select('description_yjs_state')
          .eq('id', task.id)
          .single();

        if (taskDataError) throw taskDataError;

        if (!taskData?.description_yjs_state) {
          const yjsState = convertJsonContentToYjsState(
            description,
            editorInstance.schema
          );

          const { error: updateError } = await supabase
            .from('tasks')
            .update({ description_yjs_state: Array.from(yjsState) })
            .eq('id', task.id);

          if (updateError) throw updateError;

          Y.applyUpdate(doc, yjsState);
        }
      } catch (error) {
        console.error('Error initializing Yjs state:', error);
      }
    };
    initializeYjsState();
  }, [doc, description, editorInstance, task?.id]);

  // Event-based sync: Update description field from Yjs for real-time UI updates (checkbox counts, etc.)
  // Listens to Yjs document updates and debounces DB writes to avoid unnecessary operations
  // This ensures task cards show accurate metadata (e.g., checkbox counts) without saving/closing
  useEffect(() => {
    // Only run in collaboration mode when dialog is open and we have a valid task
    if (
      !collaborationMode ||
      isCreateMode ||
      !isOpen ||
      !task?.id ||
      !flushEditorPendingRef.current ||
      !doc
    ) {
      return;
    }

    let lastSyncedContent: string | null = null;

    const syncDescriptionFromYjs = async () => {
      if (!flushEditorPendingRef.current) return;

      const currentDescription = flushEditorPendingRef.current();

      // Convert to string for comparison (null if empty, JSON string if has content)
      const descriptionString = currentDescription
        ? JSON.stringify(currentDescription)
        : null;

      // Only update if content has actually changed (avoids unnecessary DB writes)
      if (descriptionString === lastSyncedContent) {
        return;
      }

      // Save to database using centralized helper
      const success = await saveYjsDescriptionToDatabase({
        taskId: task.id,
        getContent: () => currentDescription,
        boardId,
        queryClient,
        context: 'yjs-update',
      });

      if (success) {
        lastSyncedContent = descriptionString;
      }
    };

    // Debounce the sync function to avoid excessive DB writes
    const debouncedSync = debounce(
      syncDescriptionFromYjs,
      DESCRIPTION_SYNC_DEBOUNCE_MS
    );

    // Listen to Yjs document updates
    const handleYjsUpdate = () => {
      debouncedSync();
    };

    doc.on('update', handleYjsUpdate);

    // Initial sync on mount
    syncDescriptionFromYjs();

    return () => {
      doc.off('update', handleYjsUpdate);
      debouncedSync.cancel(); // Cancel any pending debounced calls
    };
  }, [
    collaborationMode,
    isCreateMode,
    isOpen,
    task?.id,
    boardId,
    queryClient,
    doc,
  ]);

  // Reset state when dialog closes or opens
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!isOpen) {
      // Clear pending name update timer
      if (nameUpdateTimerRef.current) {
        clearTimeout(nameUpdateTimerRef.current);
        nameUpdateTimerRef.current = null;
        pendingNameRef.current = null;
      }
      setSlashState(createInitialSuggestionState());
      setMentionState(createInitialSuggestionState());
      setEditorInstance(null);
      setSlashHighlightIndex(0);
      setMentionHighlightIndex(0);
      previousMentionHighlightRef.current = 0;
      previousSlashHighlightRef.current = 0;
      setShowCustomDatePicker(false);
      setCustomDate(undefined);
      setIncludeTime(false);
      setSelectedHour('11');
      setSelectedMinute('59');
      setSelectedPeriod('PM');
    } else {
      if (isCreateMode && filters) {
        // Apply labels from filters
        if (filters.labels && filters.labels.length > 0) {
          setSelectedLabels(filters.labels);
        }

        // Apply assignees from filters or add current user if includeMyTasks is true
        if (filters.assignees && filters.assignees.length > 0) {
          // Transform filter assignees to include user_id (filters have 'id', save expects 'user_id')
          const transformedAssignees = filters.assignees.map((a) => ({
            ...a,
            user_id: a.id, // Add user_id from id
          }));
          setSelectedAssignees(transformedAssignees);
        } else if (filters.includeMyTasks) {
          // Fetch and add current user
          (async () => {
            try {
              const {
                data: { user },
              } = await supabase.auth.getUser();

              if (!user || !isMountedRef.current) {
                return;
              }

              // Fetch current user's details
              const { data: userData } = await supabase
                .from('users')
                .select('id, display_name, avatar_url')
                .eq('id', user.id)
                .single();

              if (userData && isMountedRef.current) {
                setSelectedAssignees([
                  {
                    user_id: userData.id,
                    id: userData.id,
                    display_name: userData.display_name,
                    avatar_url: userData.avatar_url,
                  },
                ]);
              }
            } catch {
              // Silently fail - user can still manually select assignees
            }
          })();
        }

        // Apply projects from filters
        if (filters.projects && filters.projects.length > 0) {
          setSelectedProjects(filters.projects);
        }

        // Apply priority if only one priority is selected in filters
        if (filters.priorities && filters.priorities.length === 1) {
          setPriority(filters.priorities[0] || null);
        }
      }
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [isOpen, isCreateMode, filters]);

  // Manage slash command highlight index
  useEffect(() => {
    if (!slashState.open) {
      setSlashHighlightIndex(0);
      previousSlashQueryRef.current = '';
      return;
    }

    if (previousSlashQueryRef.current !== slashState.query) {
      previousSlashQueryRef.current = slashState.query;
      setSlashHighlightIndex(0);
      return;
    }

    setSlashHighlightIndex((prev) => {
      if (filteredSlashCommands.length === 0) return 0;
      return Math.min(prev, filteredSlashCommands.length - 1);
    });
  }, [slashState.open, slashState.query, filteredSlashCommands.length]);

  // Scroll slash command menu item into view
  useEffect(() => {
    if (!slashState.open) return;

    if (previousSlashHighlightRef.current === slashHighlightIndex) return;
    previousSlashHighlightRef.current = slashHighlightIndex;

    const timeoutId = setTimeout(() => {
      const container = slashListRef.current;
      if (!container) return;

      const activeItem = container.querySelector<HTMLElement>(
        `[data-slash-item="${slashHighlightIndex}"]`
      );
      if (!activeItem) return;

      const containerRect = container.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();

      const isVisible =
        itemRect.top >= containerRect.top &&
        itemRect.bottom <= containerRect.bottom;

      if (!isVisible) {
        activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 10);

    return () => clearTimeout(timeoutId);
  }, [slashHighlightIndex, slashState.open]);

  // Manage mention highlight index
  useEffect(() => {
    if (!mentionState.open) {
      setMentionHighlightIndex(0);
      previousMentionQueryRef.current = '';
      return;
    }

    if (previousMentionQueryRef.current !== mentionState.query) {
      previousMentionQueryRef.current = mentionState.query;
      setMentionHighlightIndex(0);
      return;
    }

    setMentionHighlightIndex((prev) => {
      if (filteredMentionOptions.length === 0) return 0;
      return Math.min(prev, filteredMentionOptions.length - 1);
    });
  }, [mentionState.open, mentionState.query, filteredMentionOptions.length]);

  // Scroll mention menu item into view
  useEffect(() => {
    if (!mentionState.open) return;

    if (previousMentionHighlightRef.current === mentionHighlightIndex) return;
    previousMentionHighlightRef.current = mentionHighlightIndex;

    const timeoutId = setTimeout(() => {
      const container = mentionListRef.current;
      if (!container) return;

      const activeItem = container.querySelector<HTMLElement>(
        `[data-mention-item="${mentionHighlightIndex}"]`
      );
      if (!activeItem) return;

      const containerRect = container.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();

      const isVisible =
        itemRect.top >= containerRect.top &&
        itemRect.bottom <= containerRect.bottom;

      if (!isVisible) {
        activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 10);

    return () => clearTimeout(timeoutId);
  }, [mentionHighlightIndex, mentionState.open]);

  // Update slash and mention suggestions based on editor state
  useEffect(() => {
    if (!editorInstance || !isOpen) {
      closeSlashMenu();
      closeMentionMenu();
      return;
    }

    const computePosition = (fromPos: number) => {
      try {
        const coords = editorInstance.view.coordsAtPos(fromPos);
        if (!coords) return null;
        const viewportWidth =
          typeof window !== 'undefined' ? window.innerWidth : undefined;
        const horizontalPadding = 16;
        let left = coords.left;
        if (viewportWidth) {
          left = Math.min(
            left,
            viewportWidth - suggestionMenuWidth - horizontalPadding
          );
          left = Math.max(left, horizontalPadding);
        }
        return { left, top: coords.bottom + 8 } as SuggestionState['position'];
      } catch {
        return null;
      }
    };

    const updateSuggestions = () => {
      const { state } = editorInstance;
      const { selection } = state;

      if (!selection.empty) {
        closeSlashMenu();
        if (!showCustomDatePicker) {
          closeMentionMenu();
        }
        return;
      }

      const { from } = selection;
      const contextText = state.doc.textBetween(
        Math.max(0, from - 200),
        from,
        '\n',
        ' '
      );

      const slashMatch = contextText.match(/(?:^|\s)(\/([^\s]*))$/);
      if (slashMatch) {
        const matched = slashMatch[1] || '';
        const query = slashMatch[2] || '';
        const rangeFrom = from - matched.length;
        const nextState: SuggestionState = {
          open: true,
          query,
          range: { from: rangeFrom, to: from },
          position: computePosition(rangeFrom),
        };

        setSlashState((prev) =>
          isSameSuggestionState(prev, nextState) ? prev : nextState
        );
      } else {
        closeSlashMenu();
      }

      const mentionMatch = contextText.match(
        /(?:^|\s)(@(?:"([^"]*)"|([^\s]*)))$/
      );
      if (mentionMatch) {
        const matched = mentionMatch[1] || '';
        const query =
          mentionMatch[2] !== undefined
            ? mentionMatch[2]
            : mentionMatch[3] || '';
        const rangeFrom = from - matched.length;
        const nextState: SuggestionState = {
          open: true,
          query,
          range: { from: rangeFrom, to: from },
          position: computePosition(rangeFrom),
        };

        setMentionState((prev) =>
          isSameSuggestionState(prev, nextState) ? prev : nextState
        );
        closeSlashMenu();
      } else {
        if (!showCustomDatePicker) {
          closeMentionMenu();
        }
      }
    };

    const handleBlur = () => {
      if (showCustomDatePicker) {
        closeSlashMenu();
        return;
      }
      closeSlashMenu();
      closeMentionMenu();
    };

    editorInstance.on('transaction', updateSuggestions);
    editorInstance.on('selectionUpdate', updateSuggestions);
    editorInstance.on('blur', handleBlur);

    updateSuggestions();

    return () => {
      editorInstance.off('transaction', updateSuggestions);
      editorInstance.off('selectionUpdate', updateSuggestions);
      editorInstance.off('blur', handleBlur);
    };
  }, [
    editorInstance,
    isOpen,
    closeSlashMenu,
    closeMentionMenu,
    showCustomDatePicker,
  ]);

  // Blur editor when custom date picker opens
  useEffect(() => {
    if (showCustomDatePicker && editorInstance) {
      editorInstance.commands.blur();
    }
  }, [showCustomDatePicker, editorInstance]);

  // Reset form when task changes or dialog opens
  useEffect(() => {
    const taskIdChanged = previousTaskIdRef.current !== task?.id;

    // Helper to check if filters have any active values
    const hasActiveFilters =
      filters &&
      ((filters.labels && filters.labels.length > 0) ||
        (filters.assignees && filters.assignees.length > 0) ||
        (filters.projects && filters.projects.length > 0) ||
        (filters.priorities && filters.priorities.length > 0) ||
        filters.includeMyTasks);

    if (isOpen && !isCreateMode && taskIdChanged) {
      setName(task?.name || '');
      setDescription(getDescriptionContent(task?.description));
      setPriority(task?.priority || null);
      setStartDate(task?.start_date ? new Date(task?.start_date) : undefined);
      setEndDate(task?.end_date ? new Date(task?.end_date) : undefined);
      setSelectedListId(task?.list_id || '');
      setEstimationPoints(task?.estimation_points ?? null);
      setSelectedLabels(task?.labels || []);
      setSelectedAssignees(task?.assignees || []);
      setSelectedProjects(task?.projects || []);
      if (task?.id) previousTaskIdRef.current = task.id;
    } else if (
      isOpen &&
      (isCreateMode || task?.id === 'new') &&
      taskIdChanged &&
      !hasActiveFilters // Only reset if no active filters
    ) {
      setName(task?.name || '');
      setDescription(getDescriptionContent(task?.description) || null);
      setPriority(task?.priority || null);
      setStartDate(task?.start_date ? new Date(task?.start_date) : undefined);
      setEndDate(task?.end_date ? new Date(task?.end_date) : undefined);
      setSelectedListId(task?.list_id || '');
      setEstimationPoints(task?.estimation_points ?? null);
      setSelectedLabels(task?.labels || []);
      setSelectedAssignees(task?.assignees || []);
      setSelectedProjects(task?.projects || []);
      if (task?.id) previousTaskIdRef.current = task.id;
    }
  }, [isCreateMode, isOpen, task, filters]);

  // Reset transient edits when closing without saving in edit mode
  useEffect(() => {
    if (!isOpen && previousTaskIdRef.current && !isCreateMode) {
      setName(task?.name || '');
      setDescription(getDescriptionContent(task?.description));
      setPriority(task?.priority || null);
      setStartDate(task?.start_date ? new Date(task?.start_date) : undefined);
      setEndDate(task?.end_date ? new Date(task?.end_date) : undefined);
      setSelectedListId(task?.list_id || '');
      setEstimationPoints(task?.estimation_points ?? null);
      setSelectedLabels(task?.labels || []);
      setSelectedAssignees(task?.assignees || []);
      setSelectedProjects(task?.projects || []);
    }
  }, [isOpen, isCreateMode, task]);

  // Fetch workspace members when workspace ID is available
  useEffect(() => {
    if (isOpen && workspaceId) {
      fetchWorkspaceMembers(workspaceId);
      fetchTaskProjects(workspaceId);
      fetchWorkspaceDetails(workspaceId);
      fetchWorkspaceTasks(workspaceId);
    }
  }, [
    isOpen,
    workspaceId,
    fetchWorkspaceMembers,
    fetchTaskProjects,
    fetchWorkspaceDetails,
    fetchWorkspaceTasks,
  ]);

  // Debounced task search when typing in mention menu
  useEffect(() => {
    if (!isOpen || !workspaceId || !mentionState.open) {
      if (taskSearchQuery) {
        setTaskSearchQuery('');
      }
      return;
    }

    const query = mentionState.query.trim();

    if (taskSearchDebounceRef.current) {
      clearTimeout(taskSearchDebounceRef.current);
    }

    taskSearchDebounceRef.current = setTimeout(() => {
      if (query !== taskSearchQuery) {
        setTaskSearchQuery(query);
        fetchWorkspaceTasks(workspaceId, query || undefined);
      }
    }, 300);

    return () => {
      if (taskSearchDebounceRef.current) {
        clearTimeout(taskSearchDebounceRef.current);
      }
    };
  }, [
    isOpen,
    workspaceId,
    mentionState.open,
    mentionState.query,
    taskSearchQuery,
    fetchWorkspaceTasks,
  ]);

  // Fetch all accessible workspaces when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchAllWorkspaces();
    }
  }, [isOpen, fetchAllWorkspaces]);

  // Load draft when opening in create mode
  useEffect(() => {
    if (!isOpen || !isCreateMode) return;
    try {
      const raw =
        typeof window !== 'undefined'
          ? localStorage.getItem(draftStorageKey)
          : null;
      if (!raw) return;
      const draft = JSON.parse(raw || '{}');
      if (draft && typeof draft === 'object') {
        const hasContent =
          (draft.name && draft.name.trim().length > 0) ||
          draft.description != null ||
          draft.priority ||
          draft.startDate ||
          draft.endDate ||
          draft.estimationPoints != null ||
          (Array.isArray(draft.selectedLabels) &&
            draft.selectedLabels.length > 0);

        if (!hasContent) {
          if (typeof window !== 'undefined')
            localStorage.removeItem(draftStorageKey);
          return;
        }

        if (typeof draft.name === 'string') setName(draft.name);
        if (draft.description != null) {
          try {
            const maybeString = draft.description as any;
            const parsed =
              typeof maybeString === 'string'
                ? JSON.parse(maybeString)
                : maybeString;
            setDescription(parsed);
          } catch {
            setDescription(null);
          }
        }
        if (draft.priority === null || typeof draft.priority === 'string')
          setPriority(draft.priority as TaskPriority | null);
        if (draft.startDate) setStartDate(new Date(draft.startDate));
        if (draft.endDate) setEndDate(new Date(draft.endDate));
        if (typeof draft.selectedListId === 'string')
          setSelectedListId(draft.selectedListId);
        if (
          draft.estimationPoints === null ||
          typeof draft.estimationPoints === 'number'
        )
          setEstimationPoints(draft.estimationPoints as number | null);
        if (Array.isArray(draft.selectedLabels))
          setSelectedLabels(draft.selectedLabels);
        setHasDraft(true);
      }
    } catch {}
  }, [isOpen, isCreateMode, draftStorageKey]);

  // Ensure origin list from entry point is respected in create mode
  useEffect(() => {
    if (isOpen && isCreateMode && task?.list_id) {
      setSelectedListId(task.list_id);
    }
  }, [isOpen, isCreateMode, task?.list_id]);

  // Clear stale create draft when opening in edit mode
  useEffect(() => {
    if (isOpen && !isCreateMode) {
      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(draftStorageKey);
        }
      } catch {}
    }
  }, [isOpen, isCreateMode, draftStorageKey]);

  // Debounced save draft while editing in create mode
  useEffect(() => {
    if (!isOpen || !isCreateMode || isSaving) return;
    const hasAny =
      (name || '').trim().length > 0 ||
      !!description ||
      !!priority ||
      !!startDate ||
      !!endDate ||
      !!estimationPoints ||
      (selectedLabels && selectedLabels.length > 0);
    if (!hasAny) {
      try {
        if (typeof window !== 'undefined')
          localStorage.removeItem(draftStorageKey);
      } catch {}
      setHasDraft(false);
      return;
    }
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      try {
        const toSave = {
          name: (name || '').trim(),
          description: description,
          priority,
          startDate: startDate?.toISOString() || null,
          endDate: endDate?.toISOString() || null,
          selectedListId,
          estimationPoints: estimationPoints ?? null,
          selectedLabels,
        };
        if (typeof window !== 'undefined')
          localStorage.setItem(draftStorageKey, JSON.stringify(toSave));
        setHasDraft(true);
      } catch {}
    }, 300);
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    };
  }, [
    isOpen,
    isCreateMode,
    isSaving,
    draftStorageKey,
    name,
    description,
    priority,
    startDate,
    endDate,
    selectedListId,
    estimationPoints,
    selectedLabels,
  ]);

  // Global keyboard shortcut: Cmd/Ctrl + Enter to save
  // Disabled in edit mode when collaboration is enabled (realtime sync)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        // Don't allow save shortcut in edit mode with collaboration (realtime sync)
        if (!isCreateMode && collaborationMode) {
          return;
        }
        if (canSave) {
          handleSaveRef.current();
        } else if (!hasUnsavedChangesRef.current) {
          handleCloseRef.current();
        }
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, canSave, collaborationMode, isCreateMode]);

  // Keyboard shortcuts for options (Alt-based)
  useEffect(() => {
    if (!isOpen) return;
    const isTypingTarget = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      const editable = (el as any).isContentEditable === true;
      return (
        editable || tag === 'input' || tag === 'textarea' || tag === 'select'
      );
    };

    const handleOptionShortcuts = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === '1') {
        e.preventDefault();
        setPriority('critical');
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        setPriority('high');
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        setPriority('normal');
        return;
      }
      if (e.key === '4') {
        e.preventDefault();
        setPriority('low');
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        setPriority(null);
        return;
      }

      const lower = e.key.toLowerCase();
      if (lower === 't') {
        e.preventDefault();
        quickDueRef.current(0);
        return;
      }
      if (lower === 'm') {
        e.preventDefault();
        quickDueRef.current(1);
        return;
      }
      if (lower === 'w') {
        e.preventDefault();
        quickDueRef.current(7);
        return;
      }
      if (lower === 'd') {
        e.preventDefault();
        quickDueRef.current(null);
        return;
      }

      if (lower === 'a') {
        e.preventDefault();
        setShowAdvancedOptions((prev) => !prev);
        return;
      }

      if (e.shiftKey && boardConfig?.estimation_type) {
        if (/^[0-7]$/.test(e.key)) {
          e.preventDefault();
          const idx = Number(e.key);
          updateEstimationRef.current(idx);
          return;
        }
        if (lower === 'x') {
          e.preventDefault();
          updateEstimationRef.current(null);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleOptionShortcuts);
    return () => window.removeEventListener('keydown', handleOptionShortcuts);
  }, [isOpen, boardConfig?.estimation_type]);

  // Editor keyboard navigation for slash and mention menus
  useEffect(() => {
    if (!editorInstance || !isOpen) return;

    const editorDom = editorInstance.view.dom as HTMLElement | null;
    if (!editorDom) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (showCustomDatePicker && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setShowCustomDatePicker(false);
        setCustomDate(undefined);
        return;
      }

      if ((slashState.open || mentionState.open) && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeSlashMenu();
        closeMentionMenu();
        return;
      }

      if (slashState.open) {
        if (filteredSlashCommands.length === 0) return;

        if (
          event.key === 'ArrowDown' ||
          (event.key === 'Tab' && !event.shiftKey)
        ) {
          event.preventDefault();
          event.stopPropagation();
          setSlashHighlightIndex(
            (prev) => (prev + 1) % filteredSlashCommands.length
          );
          return;
        }

        if (
          event.key === 'ArrowUp' ||
          (event.key === 'Tab' && event.shiftKey)
        ) {
          event.preventDefault();
          event.stopPropagation();
          setSlashHighlightIndex(
            (prev) =>
              (prev - 1 + filteredSlashCommands.length) %
              filteredSlashCommands.length
          );
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          const command = filteredSlashCommands[slashHighlightIndex];
          if (command) executeSlashCommand(command);
          return;
        }
      }

      if (mentionState.open && !showCustomDatePicker) {
        if (filteredMentionOptions.length === 0) return;

        if (
          event.key === 'ArrowDown' ||
          (event.key === 'Tab' && !event.shiftKey)
        ) {
          event.preventDefault();
          event.stopPropagation();
          setMentionHighlightIndex(
            (prev) => (prev + 1) % filteredMentionOptions.length
          );
          return;
        }

        if (
          event.key === 'ArrowUp' ||
          (event.key === 'Tab' && event.shiftKey)
        ) {
          event.preventDefault();
          event.stopPropagation();
          setMentionHighlightIndex(
            (prev) =>
              (prev - 1 + filteredMentionOptions.length) %
              filteredMentionOptions.length
          );
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          const option = filteredMentionOptions[mentionHighlightIndex];
          if (option) insertMentionOption(option);
          return;
        }
      }
    };

    editorDom.addEventListener('keydown', handleKeyDown, true);
    return () => {
      editorDom.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [
    editorInstance,
    isOpen,
    slashState.open,
    mentionState.open,
    filteredSlashCommands,
    filteredMentionOptions,
    slashHighlightIndex,
    mentionHighlightIndex,
    executeSlashCommand,
    insertMentionOption,
    closeSlashMenu,
    closeMentionMenu,
    showCustomDatePicker,
  ]);

  // Update stable refs
  handleSaveRef.current = handleSave;
  handleCloseRef.current = handleClose;
  hasUnsavedChangesRef.current = hasUnsavedChanges;
  quickDueRef.current = handleQuickDueDate;
  updateEstimationRef.current = updateEstimation;
  handleConvertToTaskRef.current = handleConvertToTask;
  flushNameUpdateRef.current = flushNameUpdate;

  // ============================================================================
  // RENDER HELPERS - JSX fragments and menu components
  // ============================================================================
  const slashCommandMenu = (
    <SlashCommandMenu
      isOpen={slashState.open}
      position={slashState.position}
      commands={filteredSlashCommands}
      highlightIndex={slashHighlightIndex}
      onSelect={executeSlashCommand}
      onHighlightChange={setSlashHighlightIndex}
      listRef={slashListRef}
    />
  );

  const mentionSuggestionMenu = (
    <>
      <MentionMenu
        isOpen={mentionState.open}
        position={mentionState.position}
        options={filteredMentionOptions}
        highlightIndex={mentionHighlightIndex}
        isLoading={
          workspaceDetailsLoading ||
          workspaceTasksLoading ||
          allWorkspacesLoading
        }
        query={mentionState.query}
        onSelect={insertMentionOption}
        onHighlightChange={setMentionHighlightIndex}
        listRef={mentionListRef}
      />
      {showCustomDatePicker &&
        mentionState.position &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pointer-events-auto"
            style={{
              position: 'fixed',
              top: mentionState.position.top,
              left: mentionState.position.left,
              zIndex: 9999,
            }}
          >
            <CustomDatePickerDialog
              selectedDate={customDate}
              includeTime={includeTime}
              selectedHour={selectedHour}
              selectedMinute={selectedMinute}
              selectedPeriod={selectedPeriod}
              onDateSelect={setCustomDate}
              onIncludeTimeChange={setIncludeTime}
              onHourChange={setSelectedHour}
              onMinuteChange={setSelectedMinute}
              onPeriodChange={setSelectedPeriod}
              onCancel={() => {
                setShowCustomDatePicker(false);
                setCustomDate(undefined);
                setIncludeTime(false);
                setSelectedHour('12');
                setSelectedMinute('00');
                setSelectedPeriod('PM');
              }}
              onInsert={() => {
                if (customDate) {
                  handleCustomDateSelect(customDate);
                }
              }}
            />
          </div>,
          document.body
        )}
    </>
  );

  // ============================================================================
  // JSX RENDER
  // ============================================================================
  return (
    <>
      {slashCommandMenu}
      {mentionSuggestionMenu}
      <Dialog open={isOpen} onOpenChange={handleDialogOpenChange} modal={true}>
        <DialogContent
          showCloseButton={false}
          className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2 inset-0! top-0! left-0! flex h-screen max-h-screen w-screen max-w-none! translate-x-0! translate-y-0! gap-0 rounded-none! border-0 p-0"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerDownOutside={(e) => {
            if (showCustomDatePicker || slashState.open || mentionState.open) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            if (showCustomDatePicker || slashState.open || mentionState.open) {
              e.preventDefault();
            }
          }}
        >
          {/* Main content area - Task title and description */}
          <div className="flex min-w-0 flex-1 flex-col bg-background transition-all duration-300">
            {/* Enhanced Header with gradient */}
            <div className="flex items-center justify-between border-b px-4 py-2 md:px-8">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-dynamic-orange/10 ring-1 ring-dynamic-orange/20">
                  <ListTodo className="h-4 w-4 text-dynamic-orange" />
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <DialogTitle className="truncate font-semibold text-base text-foreground md:text-lg">
                    {isCreateMode ? 'Create New Task' : 'Edit Task'}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    {isCreateMode
                      ? 'Create a new task with details, assignments, and project associations'
                      : 'Edit task details, assignments, and project associations'}
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center gap-1 md:gap-2">
                {/* Collaboration Sync Status */}
                {collaborationMode && isOpen && !isCreateMode && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          'flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors',
                          synced && connected
                            ? 'bg-dynamic-green/10 text-dynamic-green'
                            : !connected
                              ? 'bg-dynamic-red/10 text-dynamic-red'
                              : 'bg-dynamic-yellow/10 text-dynamic-yellow'
                        )}
                      >
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            synced && connected
                              ? 'animate-pulse bg-dynamic-green'
                              : !connected
                                ? 'bg-dynamic-red'
                                : 'animate-pulse bg-dynamic-yellow'
                          )}
                        />
                        <span className="font-medium">
                          {synced && connected
                            ? 'Synced'
                            : !connected
                              ? 'Reconnecting...'
                              : 'Syncing...'}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <div className="space-y-1.5">
                        <p className="font-medium">
                          {synced && connected
                            ? 'All changes synced'
                            : !connected
                              ? 'Connection lost'
                              : 'Syncing in progress'}
                        </p>
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-dynamic-green' : 'bg-dynamic-red'}`}
                            />
                            <span>
                              {connected ? 'Connected' : 'Disconnected'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${synced ? 'bg-dynamic-green' : 'bg-dynamic-yellow'}`}
                            />
                            <span>{synced ? 'Synced' : 'Syncing'}</span>
                          </div>
                        </div>
                        {!connected && (
                          <p className="text-muted-foreground text-xs">
                            Attempting to reconnect automatically...
                          </p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Online Users */}
                {collaborationMode && isOpen && !isCreateMode && (
                  <UserPresenceAvatarsComponent
                    channelName={`task_presence_${task?.id}`}
                  />
                )}
                {isCreateMode && (
                  <label className="hidden items-center gap-2 text-muted-foreground text-xs md:flex">
                    <Switch
                      checked={createMultiple}
                      onCheckedChange={(v) => setCreateMultiple(Boolean(v))}
                    />
                    Create multiple
                  </label>
                )}
                {task?.id && (
                  <DropdownMenu
                    open={isMoreMenuOpen}
                    onOpenChange={setIsMoreMenuOpen}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="More options"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          // Navigate to board view
                          const boardUrl = `/${wsId}/tasks/boards/${boardId}`;
                          window.location.href = boardUrl;
                          setIsMoreMenuOpen(false);
                        }}
                      >
                        <ListTodo className="mr-2 h-4 w-4" />
                        View Board
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          navigator.clipboard.writeText(task.id);
                          toast({
                            title: 'Task ID copied',
                            description: 'Task ID has been copied to clipboard',
                          });
                          setIsMoreMenuOpen(false);
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy ID
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          const url = `${window.location.origin}${pathname?.split('/tasks/')[0]}/tasks/${task.id}`;
                          navigator.clipboard.writeText(url);
                          toast({
                            title: 'Link copied',
                            description:
                              'Task link has been copied to clipboard',
                          });
                          setIsMoreMenuOpen(false);
                        }}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Copy Link
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setShowDeleteConfirm(true);
                          setIsMoreMenuOpen(false);
                        }}
                        className="text-dynamic-red focus:text-dynamic-red"
                      >
                        <Trash className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={handleClose}
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
                {isCreateMode && hasDraft && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-dynamic-red"
                    onClick={() => {
                      try {
                        if (typeof window !== 'undefined')
                          localStorage.removeItem(draftStorageKey);
                      } catch {}
                      setHasDraft(false);
                      // Also clear current local state to an empty fresh draft
                      setName('');
                      setDescription(null);
                      setPriority(null);
                      setStartDate(undefined);
                      setEndDate(undefined);
                      setEstimationPoints(null);
                      setSelectedLabels([]);
                    }}
                    title="Discard draft"
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                )}
                {/* Hide save button in edit mode when collaboration is enabled (realtime sync) */}
                {(isCreateMode || !collaborationMode) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        onClick={handleSave}
                        disabled={!canSave}
                        size="xs"
                        className="hidden md:inline-flex"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Check className="h-4 w-4" />
                            {isCreateMode ? 'Create Task' : 'Save Changes'}
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Cmd/Ctrl + Enter
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>

            {/* Main editing area with improved spacing */}
            <div
              ref={editorContainerRef}
              className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
            >
              <div className="flex flex-col">
                {/* Task Name - Large and prominent with underline effect */}
                <div className="group">
                  <Input
                    ref={titleInputRef}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      // Trigger debounced save while typing (in edit mode)
                      if (!isCreateMode && e.target.value.trim()) {
                        updateName(e.target.value);
                      }
                    }}
                    onBlur={(e) => {
                      // Flush pending save immediately when user clicks away (in edit mode)
                      if (!isCreateMode && e.target.value.trim()) {
                        flushNameUpdate();
                      }
                    }}
                    onKeyDown={(e) => {
                      // Enter key moves to description
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        // Flush pending save immediately when pressing Enter (in edit mode)
                        if (!isCreateMode && e.currentTarget.value.trim()) {
                          flushNameUpdate();
                        }
                        const editorElement = editorRef.current?.querySelector(
                          '.ProseMirror'
                        ) as HTMLElement;
                        if (editorElement) {
                          editorElement.focus();
                          // Clear the target cursor so it goes to the start
                          targetEditorCursorRef.current = null;
                        }
                      }

                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const input = e.currentTarget;
                        const cursorPosition = input.selectionStart ?? 0;

                        // Store cursor position for smart navigation
                        lastCursorPositionRef.current = cursorPosition;
                        targetEditorCursorRef.current = cursorPosition;

                        // Focus the editor - cursor positioning will be handled by the editor via prop
                        const editorElement = editorRef.current?.querySelector(
                          '.ProseMirror'
                        ) as HTMLElement;
                        if (editorElement) {
                          editorElement.focus();
                        }
                      }

                      // Right arrow at end of title moves to description
                      if (e.key === 'ArrowRight') {
                        const input = e.currentTarget;
                        const cursorPosition = input.selectionStart ?? 0;
                        const textLength = input.value.length;

                        // Only move if cursor is at the end
                        if (cursorPosition === textLength) {
                          e.preventDefault();
                          const editorElement =
                            editorRef.current?.querySelector(
                              '.ProseMirror'
                            ) as HTMLElement;
                          if (editorElement) {
                            editorElement.focus();
                          }
                        }
                      }
                    }}
                    placeholder="What needs to be done?"
                    className="h-auto border-0 bg-transparent p-4 pb-0 font-bold text-2xl text-foreground leading-tight tracking-tight shadow-none transition-colors placeholder:text-muted-foreground/30 focus-visible:outline-0 focus-visible:ring-0 md:px-8 md:pt-4 md:pb-2 md:text-2xl"
                    autoFocus
                  />
                </div>

                {/* Task Metadata Tags - Inline Bubble Pop-ups */}
                <div className="border-y bg-muted/30">
                  {/* Header with toggle button */}
                  <button
                    type="button"
                    onClick={() => setIsMetadataExpanded(!isMetadataExpanded)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-muted/50 md:px-8"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                          !isMetadataExpanded && '-rotate-90'
                        )}
                      />
                      <span className="shrink-0 font-semibold text-foreground text-sm">
                        Properties
                      </span>
                      {/* Summary badges when collapsed */}
                      {!isMetadataExpanded && (
                        <div className="scrollbar-hide ml-2 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                          {priority && (
                            <Badge
                              variant="secondary"
                              className={cn(
                                'h-5 shrink-0 gap-1 border px-2 font-medium text-[10px]',
                                priority === 'critical' &&
                                  'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
                                priority === 'high' &&
                                  'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
                                priority === 'normal' &&
                                  'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
                                priority === 'low' &&
                                  'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue'
                              )}
                            >
                              <Flag className="h-2.5 w-2.5" />
                              {priority === 'critical'
                                ? 'Urgent'
                                : priority.charAt(0).toUpperCase() +
                                  priority.slice(1)}
                            </Badge>
                          )}
                          {(startDate || endDate) && (
                            <Badge
                              variant="secondary"
                              className="h-5 shrink-0 gap-1 border border-dynamic-orange/30 bg-dynamic-orange/10 px-2 font-medium text-[10px] text-dynamic-orange"
                            >
                              <Calendar className="h-2.5 w-2.5" />
                              {startDate && endDate
                                ? 'Scheduled'
                                : endDate
                                  ? 'Due'
                                  : 'Start'}
                            </Badge>
                          )}
                          {estimationPoints != null && (
                            <Badge
                              variant="secondary"
                              className="h-5 shrink-0 gap-1 border border-dynamic-purple/30 bg-dynamic-purple/10 px-2 font-medium text-[10px] text-dynamic-purple"
                            >
                              <Timer className="h-2.5 w-2.5" />
                              Est.
                            </Badge>
                          )}
                          {selectedLabels.length > 0 && (
                            <Badge
                              variant="secondary"
                              className="h-5 shrink-0 gap-1 border border-dynamic-indigo/30 bg-dynamic-indigo/10 px-2 font-medium text-[10px] text-dynamic-indigo"
                            >
                              <Tag className="h-2.5 w-2.5" />
                              {selectedLabels.length}
                            </Badge>
                          )}
                          {selectedProjects.length > 0 && (
                            <Badge
                              variant="secondary"
                              className="h-5 shrink-0 gap-1 border border-dynamic-sky/30 bg-dynamic-sky/10 px-2 font-medium text-[10px] text-dynamic-sky"
                            >
                              <Box className="h-2.5 w-2.5" />
                              {selectedProjects.length}
                            </Badge>
                          )}
                          {selectedListId && (
                            <Badge
                              variant="secondary"
                              className="h-5 shrink-0 gap-1 border border-dynamic-green/30 bg-dynamic-green/10 px-2 font-medium text-[10px] text-dynamic-green"
                            >
                              <ListTodo className="h-2.5 w-2.5" />
                              {availableLists?.find(
                                (l) => l.id === selectedListId
                              )?.name || 'List'}
                            </Badge>
                          )}
                          {selectedAssignees.length > 0 && (
                            <Badge
                              variant="secondary"
                              className="h-5 shrink-0 gap-1 border border-dynamic-cyan/30 bg-dynamic-cyan/10 px-2 font-medium text-[10px] text-dynamic-cyan"
                            >
                              <Users className="h-2.5 w-2.5" />
                              {selectedAssignees.length}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Expandable badges section */}
                  {isMetadataExpanded && (
                    <div className="border-t px-4 py-3 md:px-8">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Priority Badge */}
                        <Popover
                          open={isPriorityPopoverOpen}
                          onOpenChange={setIsPriorityPopoverOpen}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-xs transition-colors',
                                priority
                                  ? priority === 'critical'
                                    ? 'border-dynamic-red/30 bg-dynamic-red/15 text-dynamic-red hover:border-dynamic-red/50 hover:bg-dynamic-red/20'
                                    : priority === 'high'
                                      ? 'border-dynamic-orange/30 bg-dynamic-orange/15 text-dynamic-orange hover:border-dynamic-orange/50 hover:bg-dynamic-orange/20'
                                      : priority === 'normal'
                                        ? 'border-dynamic-yellow/30 bg-dynamic-yellow/15 text-dynamic-yellow hover:border-dynamic-yellow/50 hover:bg-dynamic-yellow/20'
                                        : 'border-dynamic-blue/30 bg-dynamic-blue/15 text-dynamic-blue hover:border-dynamic-blue/50 hover:bg-dynamic-blue/20'
                                  : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground'
                              )}
                            >
                              <Flag className="h-3.5 w-3.5" />
                              <span>
                                {priority
                                  ? priority === 'critical'
                                    ? 'Urgent'
                                    : priority.charAt(0).toUpperCase() +
                                      priority.slice(1)
                                  : 'Priority'}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-56 p-0">
                            <div className="p-1">
                              {[
                                {
                                  value: 'critical',
                                  label: 'Urgent',
                                  color: 'text-dynamic-red',
                                },
                                {
                                  value: 'high',
                                  label: 'High',
                                  color: 'text-dynamic-orange',
                                },
                                {
                                  value: 'normal',
                                  label: 'Medium',
                                  color: 'text-dynamic-yellow',
                                },
                                {
                                  value: 'low',
                                  label: 'Low',
                                  color: 'text-dynamic-blue',
                                },
                              ].map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => {
                                    updatePriority(opt.value as TaskPriority);
                                    setIsPriorityPopoverOpen(false);
                                  }}
                                  className={cn(
                                    'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted',
                                    priority === opt.value &&
                                      'bg-muted font-medium'
                                  )}
                                >
                                  <Flag className={cn('h-4 w-4', opt.color)} />
                                  <span className="flex-1">{opt.label}</span>
                                  {priority === opt.value && (
                                    <Check className="h-4 w-4 shrink-0 text-primary" />
                                  )}
                                </button>
                              ))}
                              {priority && (
                                <>
                                  <div className="my-1 border-t" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      updatePriority(null);
                                      setIsPriorityPopoverOpen(false);
                                    }}
                                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-dynamic-red/80 text-sm transition-colors hover:bg-dynamic-red/10 hover:text-dynamic-red"
                                  >
                                    <X className="h-4 w-4" />
                                    Clear priority
                                  </button>
                                </>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>

                        {/* List Badge */}
                        <Popover
                          open={isListPopoverOpen}
                          onOpenChange={setIsListPopoverOpen}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-xs transition-colors',
                                selectedListId
                                  ? 'border-dynamic-green/30 bg-dynamic-green/15 text-dynamic-green hover:border-dynamic-green/50 hover:bg-dynamic-green/20'
                                  : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground'
                              )}
                            >
                              <ListTodo className="h-3.5 w-3.5" />
                              <span>
                                {selectedListId
                                  ? availableLists?.find(
                                      (l) => l.id === selectedListId
                                    )?.name || 'List'
                                  : 'List'}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-64 p-0">
                            {!availableLists || availableLists.length === 0 ? (
                              <div className="p-4 text-center text-muted-foreground text-sm">
                                No lists found
                              </div>
                            ) : (
                              <div
                                className="max-h-60 overflow-y-auto overscroll-contain"
                                onWheel={(e) => e.stopPropagation()}
                              >
                                <div className="p-1">
                                  {availableLists.map((list) => (
                                    <button
                                      key={list.id}
                                      type="button"
                                      onClick={() => {
                                        updateList(list.id);
                                        setIsListPopoverOpen(false);
                                      }}
                                      className={cn(
                                        'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted',
                                        selectedListId === list.id &&
                                          'bg-muted font-medium'
                                      )}
                                    >
                                      <span className="flex-1">
                                        {list.name}
                                      </span>
                                      {selectedListId === list.id && (
                                        <Check className="h-4 w-4 shrink-0 text-primary" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>

                        {/* Dates Badge - Combined Start Date and Due Date */}
                        <Popover
                          open={isDueDatePopoverOpen}
                          onOpenChange={setIsDueDatePopoverOpen}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-xs transition-colors',
                                startDate || endDate
                                  ? 'border-dynamic-orange/30 bg-dynamic-orange/15 text-dynamic-orange hover:border-dynamic-orange/50 hover:bg-dynamic-orange/20'
                                  : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground'
                              )}
                            >
                              <Calendar className="h-3.5 w-3.5" />
                              <span>
                                {startDate || endDate
                                  ? `${startDate ? new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No start'} → ${endDate ? new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No due'}`
                                  : 'Dates'}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-80 p-0">
                            <div className="rounded-lg p-3.5">
                              <div className="space-y-3">
                                {/* Start Date */}
                                <div className="space-y-1.5">
                                  <Label className="font-normal text-muted-foreground text-xs">
                                    Start Date
                                  </Label>
                                  <DateTimePicker
                                    date={startDate}
                                    setDate={updateStartDate}
                                    showTimeSelect={true}
                                    allowClear={true}
                                    showFooterControls={true}
                                    maxDate={endDate}
                                  />
                                </div>

                                {/* Due Date */}
                                <div className="space-y-1.5">
                                  <Label className="font-normal text-muted-foreground text-xs">
                                    Due Date
                                  </Label>

                                  <DateTimePicker
                                    date={endDate}
                                    setDate={handleEndDateChange}
                                    showTimeSelect={true}
                                    allowClear={true}
                                    showFooterControls={true}
                                    minDate={startDate}
                                  />

                                  {/* Date Range Warning */}
                                  {startDate &&
                                    endDate &&
                                    startDate > endDate && (
                                      <div className="flex items-center gap-2 rounded-md border border-dynamic-orange/30 bg-dynamic-orange/10 px-3 py-2 text-xs">
                                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-dynamic-orange" />
                                        <span className="text-dynamic-orange">
                                          Start date is after due date
                                        </span>
                                      </div>
                                    )}

                                  {/* Quick Due Date Actions */}
                                  <div className="space-y-1.5 pt-2">
                                    <Label className="font-normal text-muted-foreground text-xs">
                                      Quick Actions
                                    </Label>
                                    <div className="grid grid-cols-2 gap-1.5 md:gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="xs"
                                        onClick={() => handleQuickDueDate(0)}
                                        disabled={isLoading}
                                        className="h-7 text-[11px] transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 md:text-xs"
                                        title="Today – Alt+T"
                                      >
                                        Today
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="xs"
                                        onClick={() => handleQuickDueDate(1)}
                                        disabled={isLoading}
                                        className="h-7 text-[11px] transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 md:text-xs"
                                        title="Tomorrow – Alt+M"
                                      >
                                        Tomorrow
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="xs"
                                        onClick={() => {
                                          const daysUntilEndOfWeek =
                                            6 - dayjs().day();
                                          handleQuickDueDate(
                                            daysUntilEndOfWeek
                                          );
                                        }}
                                        disabled={isLoading}
                                        className="h-7 text-[11px] transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 md:text-xs"
                                        title="End of this week (Saturday)"
                                      >
                                        This week
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="xs"
                                        onClick={() => handleQuickDueDate(7)}
                                        disabled={isLoading}
                                        className="h-7 text-[11px] transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 md:text-xs"
                                        title="Next week – Alt+W"
                                      >
                                        Next week
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>

                        {/* Estimation Points Badge */}
                        {boardConfig?.estimation_type && (
                          <Popover
                            open={isEstimationPopoverOpen}
                            onOpenChange={setIsEstimationPopoverOpen}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className={cn(
                                  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-xs transition-colors',
                                  estimationPoints != null
                                    ? 'border-dynamic-purple/30 bg-dynamic-purple/15 text-dynamic-purple hover:border-dynamic-purple/50 hover:bg-dynamic-purple/20'
                                    : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground'
                                )}
                              >
                                <Timer className="h-3.5 w-3.5" />
                                <span>
                                  {estimationPoints != null
                                    ? mapEstimationPoints(
                                        estimationPoints,
                                        boardConfig.estimation_type
                                      )
                                    : 'Estimate'}
                                </span>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-56 p-0">
                              <div className="p-1">
                                {estimationIndices.map((idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => {
                                      updateEstimation(idx);
                                      setIsEstimationPopoverOpen(false);
                                    }}
                                    className={cn(
                                      'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted',
                                      estimationPoints === idx &&
                                        'bg-muted font-medium'
                                    )}
                                  >
                                    <span className="flex-1">
                                      {mapEstimationPoints(
                                        idx,
                                        boardConfig.estimation_type
                                      )}
                                    </span>
                                    {estimationPoints === idx && (
                                      <Check className="h-4 w-4 shrink-0 text-primary" />
                                    )}
                                  </button>
                                ))}
                                {estimationPoints != null && (
                                  <>
                                    <div className="my-1 border-t" />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        updateEstimation(null);
                                        setIsEstimationPopoverOpen(false);
                                      }}
                                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-dynamic-red/80 text-sm transition-colors hover:bg-dynamic-red/10 hover:text-dynamic-red"
                                    >
                                      <X className="h-4 w-4" />
                                      Clear estimate
                                    </button>
                                  </>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}

                        {/* Labels Badge */}
                        <Popover
                          open={isLabelsPopoverOpen}
                          onOpenChange={setIsLabelsPopoverOpen}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-xs transition-colors',
                                selectedLabels.length > 0
                                  ? 'border-dynamic-indigo/30 bg-dynamic-indigo/15 text-dynamic-indigo hover:border-dynamic-indigo/50 hover:bg-dynamic-indigo/20'
                                  : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground'
                              )}
                            >
                              <Tag className="h-3.5 w-3.5" />
                              <span>
                                {selectedLabels.length === 0
                                  ? 'Labels'
                                  : selectedLabels.length === 1
                                    ? selectedLabels[0]?.name
                                    : `${selectedLabels.length} labels`}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-72 p-0">
                            {availableLabels.length === 0 ? (
                              <div className="p-4 text-center text-muted-foreground text-sm">
                                No labels found
                              </div>
                            ) : (
                              <>
                                {selectedLabels.length > 0 && (
                                  <div className="border-b p-2">
                                    <div className="flex flex-wrap gap-1.5">
                                      {selectedLabels.map((label) => {
                                        const styles =
                                          computeAccessibleLabelStyles(
                                            label.color
                                          );
                                        return (
                                          <Badge
                                            key={label.id}
                                            variant="secondary"
                                            className="h-6 cursor-pointer gap-1 px-2 text-xs transition-opacity hover:opacity-80"
                                            style={
                                              styles
                                                ? {
                                                    backgroundColor: styles.bg,
                                                    borderColor: styles.border,
                                                    color: styles.text,
                                                  }
                                                : undefined
                                            }
                                            onClick={() => toggleLabel(label)}
                                          >
                                            {label.name}
                                            <X className="h-2.5 w-2.5" />
                                          </Badge>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                <div
                                  className="max-h-60 overflow-y-auto overscroll-contain"
                                  onWheel={(e) => e.stopPropagation()}
                                >
                                  <div className="p-1">
                                    {availableLabels
                                      .filter(
                                        (l) =>
                                          !selectedLabels.some(
                                            (sl) => sl.id === l.id
                                          )
                                      )
                                      .map((label) => {
                                        const styles =
                                          computeAccessibleLabelStyles(
                                            label.color
                                          );
                                        return (
                                          <button
                                            key={label.id}
                                            type="button"
                                            onClick={() => toggleLabel(label)}
                                            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                                          >
                                            <span
                                              className="h-3 w-3 shrink-0 rounded-full"
                                              style={{
                                                backgroundColor:
                                                  styles?.bg || '#ccc',
                                              }}
                                            />
                                            <span className="flex-1">
                                              {label.name}
                                            </span>
                                            <Plus className="h-4 w-4 shrink-0" />
                                          </button>
                                        );
                                      })}
                                  </div>
                                </div>
                              </>
                            )}
                          </PopoverContent>
                        </Popover>

                        {/* Projects Badge */}
                        <Popover
                          open={isProjectsPopoverOpen}
                          onOpenChange={setIsProjectsPopoverOpen}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-xs transition-colors',
                                selectedProjects.length > 0
                                  ? 'border-dynamic-sky/30 bg-dynamic-sky/15 text-dynamic-sky hover:border-dynamic-sky/50 hover:bg-dynamic-sky/20'
                                  : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground'
                              )}
                            >
                              <Box className="h-3.5 w-3.5" />
                              <span>
                                {selectedProjects.length === 0
                                  ? 'Projects'
                                  : selectedProjects.length === 1
                                    ? selectedProjects[0]?.name
                                    : `${selectedProjects.length} projects`}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-72 p-0">
                            {taskProjects.length === 0 ? (
                              <div className="p-4 text-center text-muted-foreground text-sm">
                                No projects found
                              </div>
                            ) : (
                              <>
                                {selectedProjects.length > 0 && (
                                  <div className="border-b p-2">
                                    <div className="flex flex-wrap gap-1.5">
                                      {selectedProjects.map((project) => (
                                        <Badge
                                          key={project.id}
                                          variant="secondary"
                                          className="item-center h-auto cursor-pointer gap-1 whitespace-normal border-dynamic-sky/30 bg-dynamic-sky/10 px-2 text-dynamic-sky text-xs transition-opacity hover:opacity-80"
                                          onClick={() => toggleProject(project)}
                                        >
                                          <span className="wrap-break-word">
                                            {project.name}
                                          </span>
                                          <X className="h-2.5 w-2.5 shrink-0" />
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div
                                  className="max-h-60 overflow-y-auto overscroll-contain"
                                  onWheel={(e) => e.stopPropagation()}
                                >
                                  <div className="p-1">
                                    {taskProjects
                                      .filter(
                                        (p) =>
                                          !selectedProjects.some(
                                            (sp) => sp.id === p.id
                                          )
                                      )
                                      .map((project) => (
                                        <button
                                          key={project.id}
                                          type="button"
                                          onClick={() => toggleProject(project)}
                                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                                        >
                                          <span className="wrap-break-word flex-1 whitespace-normal">
                                            {project.name}
                                          </span>
                                          <Plus className="h-4 w-4 shrink-0" />
                                        </button>
                                      ))}
                                  </div>
                                </div>
                              </>
                            )}
                          </PopoverContent>
                        </Popover>

                        {/* Assignees Badge */}
                        <Popover
                          open={isAssigneesPopoverOpen}
                          onOpenChange={setIsAssigneesPopoverOpen}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-xs transition-colors',
                                selectedAssignees.length > 0
                                  ? 'border-dynamic-cyan/30 bg-dynamic-cyan/15 text-dynamic-cyan hover:border-dynamic-cyan/50 hover:bg-dynamic-cyan/20'
                                  : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground'
                              )}
                            >
                              <Users className="h-3.5 w-3.5" />
                              <span>
                                {selectedAssignees.length === 0
                                  ? 'Assignees'
                                  : selectedAssignees.length === 1
                                    ? selectedAssignees[0]?.display_name ||
                                      'Unknown'
                                    : `${selectedAssignees.length} assignees`}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-72 p-0">
                            {workspaceMembers.length === 0 ? (
                              <div className="p-4 text-center text-muted-foreground text-sm">
                                No members found
                              </div>
                            ) : (
                              <>
                                {selectedAssignees.length > 0 && (
                                  <div className="border-b p-2">
                                    <div className="flex flex-wrap gap-1.5">
                                      {selectedAssignees.map((assignee) => (
                                        <Badge
                                          key={assignee.id || assignee.user_id}
                                          variant="secondary"
                                          className="h-6 cursor-pointer gap-1.5 px-2 text-xs transition-opacity hover:opacity-80"
                                          onClick={() =>
                                            toggleAssignee(assignee)
                                          }
                                        >
                                          <Avatar className="h-3.5 w-3.5">
                                            <AvatarImage
                                              src={assignee.avatar_url}
                                              alt={
                                                assignee.display_name ||
                                                'Unknown'
                                              }
                                            />
                                            <AvatarFallback className="text-[8px]">
                                              {(assignee.display_name ||
                                                'Unknown')[0]?.toUpperCase()}
                                            </AvatarFallback>
                                          </Avatar>
                                          {assignee.display_name || 'Unknown'}
                                          <X className="h-2.5 w-2.5" />
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div
                                  className="max-h-60 overflow-y-auto overscroll-contain"
                                  onWheel={(e) => e.stopPropagation()}
                                >
                                  <div className="p-1">
                                    {workspaceMembers
                                      .filter(
                                        (m) =>
                                          !selectedAssignees.some(
                                            (a) =>
                                              (a.id || a.user_id) ===
                                              (m.user_id || m.id)
                                          )
                                      )
                                      .map((member) => (
                                        <button
                                          key={member.user_id}
                                          type="button"
                                          onClick={() => toggleAssignee(member)}
                                          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                                        >
                                          <Avatar className="h-5 w-5 shrink-0 border">
                                            <AvatarImage
                                              src={member.avatar_url}
                                              alt={
                                                member.display_name || 'Unknown'
                                              }
                                            />
                                            <AvatarFallback className="text-[9px]">
                                              {(member.display_name ||
                                                'Unknown')[0]?.toUpperCase()}
                                            </AvatarFallback>
                                          </Avatar>
                                          <span className="flex-1">
                                            {member.display_name || 'Unknown'}
                                          </span>
                                          <Plus className="h-4 w-4 shrink-0" />
                                        </button>
                                      ))}
                                  </div>
                                </div>
                              </>
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  )}
                </div>

                {/* Task Description - Full editor experience with subtle border */}
                <div ref={editorRef} className="relative pb-8">
                  {isYjsSyncing ? (
                    <div className="flex min-h-[400px] items-center justify-center">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <p className="text-muted-foreground text-sm">
                          Syncing collaboration state...
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div ref={richTextEditorRef} className="relative">
                      <RichTextEditor
                        content={description}
                        onChange={setDescription}
                        writePlaceholder="Add a detailed description, attach files, or use markdown..."
                        titlePlaceholder=""
                        className="min-h-[400px] border-0 bg-transparent px-4 focus-visible:outline-0 focus-visible:ring-0 md:px-8"
                        workspaceId={workspaceId || undefined}
                        onImageUpload={handleImageUpload}
                        flushPendingRef={flushEditorPendingRef}
                        initialCursorOffset={targetEditorCursorRef.current}
                        onEditorReady={handleEditorReady}
                        boardId={boardId}
                        availableLists={availableLists}
                        queryClient={queryClient}
                        onArrowUp={(cursorOffset) => {
                          // Focus the title input when pressing arrow up at the start
                          if (titleInputRef.current) {
                            titleInputRef.current.focus();

                            // Apply smart cursor positioning
                            if (cursorOffset !== undefined) {
                              const textLength =
                                titleInputRef.current.value.length;
                              // Use the stored position from last down arrow, or the offset from editor
                              const targetPosition =
                                lastCursorPositionRef.current ??
                                Math.min(cursorOffset, textLength);
                              titleInputRef.current.setSelectionRange(
                                targetPosition,
                                targetPosition
                              );
                              // Clear the stored position after use
                              lastCursorPositionRef.current = null;
                            }
                          }
                        }}
                        onArrowLeft={() => {
                          // Focus the title input at the end when pressing arrow left at the start
                          if (titleInputRef.current) {
                            titleInputRef.current.focus();
                            // Set cursor to the end of the input
                            const length = titleInputRef.current.value.length;
                            titleInputRef.current.setSelectionRange(
                              length,
                              length
                            );
                          }
                        }}
                        yjsDoc={
                          isOpen && !isCreateMode && collaborationMode
                            ? doc
                            : null
                        }
                        yjsProvider={
                          isOpen && !isCreateMode && collaborationMode
                            ? provider
                            : null
                        }
                        allowCollaboration={
                          isOpen && !isCreateMode && collaborationMode
                        }
                      />
                      {isOpen && !isCreateMode && collaborationMode && (
                        <CursorOverlayWrapper
                          channelName={`editor-cursor-${task?.id}`}
                          containerRef={richTextEditorRef}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Mobile floating save button - hidden in edit mode when collaboration is enabled */}
          {(isCreateMode || !collaborationMode) && (
            <div className="fixed right-4 bottom-4 z-40 md:hidden">
              <Button
                variant="default"
                size="lg"
                onClick={handleSave}
                disabled={!canSave}
                className="h-14 w-14 rounded-full bg-dynamic-orange shadow-lg hover:bg-dynamic-orange/90"
              >
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Check className="h-6 w-6" />
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        key="delete-dialog"
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        modal={true}
      >
        <DialogContent showCloseButton={false} className="max-w-sm">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-dynamic-red/10 ring-1 ring-dynamic-red/20">
              <Trash className="h-4 w-4 text-dynamic-red" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-base">Delete task?</DialogTitle>
              <DialogDescription className="mt-1 text-muted-foreground text-sm">
                This action cannot be undone. The task will be permanently
                removed.
              </DialogDescription>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={isLoading}
              onClick={async () => {
                try {
                  if (task?.id) {
                    const { error } = await supabase
                      .from('tasks')
                      .delete()
                      .eq('id', task.id);
                    if (error) throw error;
                  }

                  await invalidateTaskCaches(queryClient, boardId);
                  toast({ title: 'Task deleted' });
                  setShowDeleteConfirm(false);
                  onUpdate();
                  onClose();
                } catch (e: any) {
                  toast({
                    title: 'Failed to delete task',
                    description: e.message || 'Please try again',
                    variant: 'destructive',
                  });
                }
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sync warning dialog */}
      <SyncWarningDialog
        open={showSyncWarning}
        onOpenChange={setShowSyncWarning}
        synced={synced}
        connected={connected}
        onForceClose={handleForceClose}
      />
    </>
  );
}

export const TaskEditDialog = React.memo(TaskEditDialogComponent);
