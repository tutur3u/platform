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
  Search,
  Settings,
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
import { Switch } from '@tuturuuu/ui/switch';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { DEV_MODE } from '@tuturuuu/utils/constants';
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
import { CursorOverlayWrapper } from './cursor-overlay';
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
import { UserPresenceAvatarsComponent } from './user-presence-avatars';

interface TaskEditDialogProps {
  task?: Task;
  boardId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
  availableLists?: TaskList[];
  onOpenTask?: (taskId: string) => void;
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

function TaskEditDialogComponent({
  task,
  boardId,
  isOpen,
  onClose,
  onUpdate,
  availableLists: propAvailableLists,
  onOpenTask,
  mode = 'edit',
  showUserPresence = false,
}: TaskEditDialogProps & {
  mode?: 'edit' | 'create';
  showUserPresence?: boolean;
}) {
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
  const lastCursorPositionRef = useRef<number | null>(null);
  const targetEditorCursorRef = useRef<number | null>(null);
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

  const { doc, provider } = useYjsCollaboration({
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
    enabled:
      DEV_MODE && isOpen && !isCreateMode && showUserPresence && !!task?.id,
  });

  useEffect(() => {
    const getUser = async () => {
      const supabase = createClient();
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
  // BOARD & WORKSPACE DATA - Board config, workspace ID, and lists
  // ============================================================================
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const { data: boardConfig } = useBoardConfig(boardId);
  const { data: availableLists = [] } = useQuery({
    queryKey: ['task_lists', boardId],
    queryFn: async () => {
      const supabase = createClient();
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
  const { data: workspaceLabelsData = [], isLoading: labelsLoading } =
    useWorkspaceLabels(workspaceId);
  const [availableLabels, setAvailableLabels] = useState<WorkspaceTaskLabel[]>(
    []
  );
  const [selectedLabels, setSelectedLabels] = useState<WorkspaceTaskLabel[]>(
    task?.labels || []
  );
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('gray');
  const [creatingLabel, setCreatingLabel] = useState(false);

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
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selectedAssignees, setSelectedAssignees] = useState<any[]>(
    task?.assignees || []
  );
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('');

  const fetchWorkspaceMembers = useCallback(async (wsId: string) => {
    try {
      setLoadingMembers(true);
      const supabase = createClient();
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
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  // ============================================================================
  // PROJECTS - Task projects and selection
  // ============================================================================
  const [taskProjects, setTaskProjects] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<any[]>(
    task?.projects || []
  );
  const [projectSearchQuery, setProjectSearchQuery] = useState('');

  const fetchTaskProjects = useCallback(async (wsId: string) => {
    try {
      setLoadingProjects(true);
      const supabase = createClient();
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
    } finally {
      setLoadingProjects(false);
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
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from('workspaces')
        .select('id, name, handle, personal, workspace_members!inner(role)')
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
      const supabase = createClient();
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
        const supabase = createClient();

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
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  const slashListRef = useRef<HTMLDivElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const previousMentionHighlightRef = useRef(0);
  const previousSlashHighlightRef = useRef(0);
  const previousSlashQueryRef = useRef('');
  const previousMentionQueryRef = useRef('');
  const originalUrlRef = useRef<string | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

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
  const [showOptionsSidebar, setShowOptionsSidebar] = useState(isCreateMode);
  const [createMultiple, setCreateMultiple] = useState(false);

  // ============================================================================
  // DRAFT PERSISTENCE - Auto-save drafts in create mode
  // ============================================================================
  const [hasDraft, setHasDraft] = useState(false);

  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    return (
      initialSnapshot.name !== currentSnapshot.name ||
      initialSnapshot.description !== currentSnapshot.description ||
      initialSnapshot.priority !== currentSnapshot.priority ||
      initialSnapshot.start !== currentSnapshot.start ||
      initialSnapshot.end !== currentSnapshot.end ||
      initialSnapshot.listId !== currentSnapshot.listId ||
      initialSnapshot.estimationPoints !== currentSnapshot.estimationPoints
    );
  }, [initialSnapshot, currentSnapshot]);

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
      if (mode === 'create') {
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
    [mode, onUpdate, queryClient, task, updateTaskMutation, boardId, toast]
  );

  const handleEndDateChange = useCallback((date: Date | undefined) => {
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
      setEndDate(selectedDate.toDate());
    } else {
      setEndDate(undefined);
    }
  }, []);

  const updateEstimation = useCallback(
    async (points: number | null) => {
      if (points === estimationPoints) return;
      setEstimationPoints(points);
      if (isCreateMode || !task?.id || task?.id === 'new') {
        return;
      }
      setEstimationSaving(true);
      try {
        const supabase = createClient();

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

  const handleImageUpload = useCallback(
    async (file: File): Promise<string> => {
      if (!workspaceId) {
        throw new Error('Workspace ID not found');
      }

      const supabase = createClient();

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
      const supabase = createClient();
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

  const handleCreateLabel = useCallback(async () => {
    if (!newLabelName.trim() || !boardConfig) return;
    setCreatingLabel(true);
    try {
      const supabase = createClient();
      let wsId: string | undefined = (boardConfig as any)?.ws_id;
      if (!wsId) {
        const { data: board } = await supabase
          .from('workspace_boards')
          .select('ws_id')
          .eq('id', boardId)
          .single();
        wsId = (board as any)?.ws_id;
      }
      if (!wsId) throw new Error('Workspace id not found');
      const { data, error } = await supabase
        .from('workspace_task_labels')
        .insert({
          ws_id: wsId,
          name: newLabelName.trim(),
          color: newLabelColor,
        })
        .select('id,name,color,created_at')
        .single();
      if (error) throw error;
      if (data) {
        setAvailableLabels((prev) =>
          [data as any, ...prev].sort((a, b) =>
            (a?.name || '')
              .toLowerCase()
              .localeCompare((b?.name || '').toLowerCase())
          )
        );
        setSelectedLabels((prev) =>
          [data as any, ...prev].sort((a, b) =>
            (a?.name || '')
              .toLowerCase()
              .localeCompare((b?.name || '').toLowerCase())
          )
        );

        if (task?.id) {
          const { error: linkErr } = await supabase
            .from('task_labels')
            .insert({ task_id: task?.id, label_id: (data as any).id });

          if (linkErr) {
            setSelectedLabels((prev) =>
              prev.filter((l) => l.id !== (data as any).id)
            );
            toast({
              title: 'Label created (not linked)',
              description: 'Label saved but could not be attached to task.',
              variant: 'destructive',
            });
          } else {
            await invalidateTaskCaches(queryClient, boardId);
            onUpdate();
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('workspace-label-created', {
                  detail: { wsId, label: data },
                })
              );
            }
            toast({
              title: 'Label created & linked',
              description: 'New label added and attached to this task.',
            });
          }
        }

        setNewLabelName('');
      }
    } catch (e: any) {
      toast({
        title: 'Label creation failed',
        description: e.message || 'Unable to create label',
        variant: 'destructive',
      });
    } finally {
      setCreatingLabel(false);
    }
  }, [
    newLabelName,
    boardConfig,
    newLabelColor,
    boardId,
    task?.id,
    queryClient,
    onUpdate,
    toast,
  ]);

  const toggleAssignee = useCallback(
    async (member: any) => {
      // selectedAssignees has 'id' property, workspaceMembers has 'user_id' property
      const userId = member.user_id || member.id;
      const exists = selectedAssignees.some(
        (a) => (a.id || a.user_id) === userId
      );
      const supabase = createClient();
      try {
        if (mode === 'create') {
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
    [selectedAssignees, mode, task?.id, boardId, queryClient, onUpdate, toast]
  );

  const toggleProject = useCallback(
    async (project: any) => {
      const exists = selectedProjects.some((p) => p.id === project.id);
      const supabase = createClient();
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
        const supabase = createClient();
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
        const supabase = createClient();
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

    const taskUpdates: any = {
      name: name.trim(),
      description: descriptionString,
      priority: priority,
      start_date: startDate ? startDate.toISOString() : null,
      end_date: endDate ? endDate.toISOString() : null,
      list_id: selectedListId,
      estimation_points: estimationPoints ?? null,
    };

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
  ]);

  const handleClose = useCallback(() => {
    if (!isLoading) {
      try {
        if (!isCreateMode && typeof window !== 'undefined') {
          localStorage.removeItem(draftStorageKey);
        }
      } catch {}
      onClose();
    }
  }, [isLoading, isCreateMode, draftStorageKey, onClose]);

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

  // Initialize Yjs state for task description if not present
  useEffect(() => {
    if (!task?.id || !editorInstance?.schema || !description || !doc) return;

    const initializeYjsState = async () => {
      try {
        const supabase = createClient();

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

  // Sync URL with task dialog state (edit mode only)
  useEffect(() => {
    if (!isOpen || isCreateMode || !task?.id || !workspaceId || !pathname)
      return;

    if (!originalUrlRef.current && !pathname.match(/\/tasks\/[^/]+$/)) {
      originalUrlRef.current = pathname;
    }

    const newUrl = `/${workspaceId}/tasks/${task.id}`;
    window.history.replaceState(null, '', newUrl);

    return () => {
      if (originalUrlRef.current) {
        window.history.replaceState(null, '', originalUrlRef.current);
        originalUrlRef.current = null;
      } else if (boardId) {
        window.history.replaceState(
          null,
          '',
          `/${workspaceId}/tasks/boards/${boardId}`
        );
      }
    };
  }, [isOpen, task?.id, pathname, boardId, isCreateMode, workspaceId]);

  // Reset state when dialog closes or opens
  useEffect(() => {
    if (!isOpen) {
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
      if (isCreateMode) {
        setShowOptionsSidebar(true);
      }
    }
  }, [isOpen, isCreateMode]);

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

    if (isOpen && !isCreateMode && (task?.id || taskIdChanged)) {
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
      taskIdChanged
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
  }, [
    task?.id,
    isOpen,
    isCreateMode,
    task?.assignees,
    task?.description,
    task?.end_date,
    task?.estimation_points,
    task?.labels,
    task?.list_id,
    task?.name,
    task?.priority,
    task?.projects,
    task?.start_date,
  ]);

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

  // Listen for task mention clicks
  useEffect(() => {
    if (!isOpen) return;

    const handleTaskMentionClick = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        taskId: string;
        taskName: string;
      }>;
      const { taskId } = customEvent.detail;

      if (!taskId || !onOpenTask) return;

      if (
        hasUnsavedChangesRef.current &&
        !isCreateMode &&
        name?.trim() &&
        !isLoading &&
        task?.id
      ) {
        try {
          let currentDescription = description;
          if (flushEditorPendingRef.current) {
            const flushedContent = flushEditorPendingRef.current();
            if (flushedContent) {
              currentDescription = flushedContent;
            }
          }

          let descriptionString: string | null = null;
          if (currentDescription) {
            try {
              descriptionString = JSON.stringify(currentDescription);
            } catch (serializationError) {
              console.error(
                'Failed to serialize description:',
                serializationError
              );
              descriptionString = null;
            }
          }

          const taskUpdates: any = {
            name: name.trim(),
            description: descriptionString,
            priority: priority,
            start_date: startDate ? startDate.toISOString() : null,
            end_date: endDate ? endDate.toISOString() : null,
            list_id: selectedListId,
            estimation_points: estimationPoints ?? null,
          };

          await updateTaskMutation.mutateAsync({
            taskId: task.id,
            updates: taskUpdates,
          });

          await invalidateTaskCaches(queryClient, boardId);
          onUpdate();

          console.log('âœ… Task saved before navigation');
        } catch (error) {
          console.error('Failed to save before navigation:', error);
        }
      }

      onOpenTask(taskId);
    };

    document.addEventListener('taskMentionClick', handleTaskMentionClick);

    return () => {
      document.removeEventListener('taskMentionClick', handleTaskMentionClick);
    };
  }, [
    isOpen,
    onOpenTask,
    isCreateMode,
    name,
    isLoading,
    task?.id,
    description,
    priority,
    startDate,
    endDate,
    selectedListId,
    estimationPoints,
    updateTaskMutation,
    queryClient,
    boardId,
    onUpdate,
  ]);

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
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
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
  }, [isOpen, canSave]);

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
      <Dialog
        key="main-dialog"
        open={isOpen}
        onOpenChange={handleDialogOpenChange}
        modal={true}
      >
        <DialogContent
          showCloseButton={false}
          className="!inset-0 !top-0 !left-0 !max-w-none !translate-x-0 !translate-y-0 !rounded-none data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2 flex h-screen max-h-screen w-screen gap-0 border-0 p-0"
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
                {/* Online Users */}
                {showUserPresence && isOpen && !isCreateMode && (
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
                {isCreateMode ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowOptionsSidebar(!showOptionsSidebar)}
                    title="Toggle options"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                ) : (
                  task?.id && (
                    <DropdownMenu>
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
                            navigator.clipboard.writeText(task.id);
                            toast({
                              title: 'Task ID copied',
                              description:
                                'Task ID has been copied to clipboard',
                            });
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
                          }}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Copy Link
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() =>
                            setShowOptionsSidebar(!showOptionsSidebar)
                          }
                        >
                          <Settings className="mr-2 h-4 w-4" />
                          Options
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setShowDeleteConfirm(true)}
                          className="text-dynamic-red focus:text-dynamic-red"
                        >
                          <Trash className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )
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
              </div>
            </div>

            {/* Main editing area with improved spacing */}
            <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div ref={editorContainerRef} className="flex flex-col">
                {/* Task Name - Large and prominent with underline effect */}
                <div className="group">
                  <Input
                    ref={titleInputRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter key moves to description
                      if (e.key === 'Enter') {
                        e.preventDefault();
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
                    className="h-auto border-0 bg-transparent p-4 pb-0 font-bold text-2xl text-foreground leading-tight tracking-tight transition-colors placeholder:text-muted-foreground/30 focus-visible:outline-0 focus-visible:ring-0 md:px-8 md:pt-10 md:pb-6 md:text-2xl"
                    autoFocus
                  />
                </div>

                {/* Task Description - Full editor experience with subtle border */}
                <div ref={editorRef} className="relative flex-1 pb-8">
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
                    yjsDoc={
                      isOpen && !isCreateMode && showUserPresence ? doc : null
                    }
                    yjsProvider={
                      isOpen && !isCreateMode && showUserPresence
                        ? provider
                        : null
                    }
                    boardId={boardId}
                    availableLists={availableLists}
                    queryClient={queryClient}
                    onArrowUp={(cursorOffset) => {
                      // Focus the title input when pressing arrow up at the start
                      if (titleInputRef.current) {
                        titleInputRef.current.focus();

                        // Apply smart cursor positioning
                        if (cursorOffset !== undefined) {
                          const textLength = titleInputRef.current.value.length;
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
                        titleInputRef.current.setSelectionRange(length, length);
                      }
                    }}
                  />
                </div>
              </div>
              {isOpen && !isCreateMode && showUserPresence && (
                <CursorOverlayWrapper
                  channelName={`editor-cursor-${task?.id}`}
                  containerRef={editorContainerRef}
                />
              )}
            </div>
          </div>

          {/* Simplified Right sidebar - toggleable */}
          {showOptionsSidebar && (
            <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background shadow-lg transition-all duration-300 sm:w-[380px] md:relative md:z-auto md:w-[380px] md:bg-gradient-to-b md:from-muted/20 md:to-muted/5 md:shadow-none">
              {/* Sidebar header with icon */}
              <div className="border-border/50 border-b bg-gradient-to-b from-background/95 to-background/80 px-6 py-4 backdrop-blur-md">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-orange/10">
                      <Settings className="h-4 w-4 text-dynamic-orange" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground text-sm leading-none tracking-tight">
                        Task Options
                      </h3>
                      <p className="mt-1 text-muted-foreground text-xs">
                        Configure task settings
                      </p>
                    </div>
                  </div>
                  {/* Close sidebar button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setShowOptionsSidebar(false)}
                    title="Close sidebar"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="scrollbar-thin flex-1 overflow-y-auto">
                <div className="space-y-4 p-4 md:space-y-5 md:p-6">
                  {/* Essential Options - Always Visible */}
                  {/* List Selection */}
                  <div className="space-y-2.5 rounded-lg border border-border/60 bg-gradient-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm transition-shadow hover:shadow-md">
                    <Label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                      <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                        <ListTodo className="h-3.5 w-3.5 text-dynamic-orange" />
                      </div>
                      List
                    </Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-8 w-full justify-between text-xs transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 md:text-sm"
                        >
                          <span className="truncate">
                            {availableLists.find(
                              (list) => list.id === selectedListId
                            )?.name || 'Select list'}
                          </span>
                          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[320px] md:w-[376px]">
                        {availableLists.map((list) => (
                          <DropdownMenuItem
                            key={list.id}
                            onClick={() => setSelectedListId(list.id)}
                            className={cn(
                              'cursor-pointer transition-colors',
                              selectedListId === list.id &&
                                'bg-dynamic-orange/10 font-medium text-dynamic-orange'
                            )}
                          >
                            <Check
                              className={cn(
                                'h-4 w-4',
                                selectedListId === list.id
                                  ? 'opacity-100'
                                  : 'opacity-0'
                              )}
                            />
                            {list.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Priority (Dropdown) */}
                  <div className="space-y-2.5 rounded-lg border border-border/60 bg-gradient-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm transition-shadow hover:shadow-md">
                    <Label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                      <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                        <Flag className="h-3.5 w-3.5 text-dynamic-orange" />
                      </div>
                      Priority
                    </Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'h-8 w-full justify-between text-xs transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 md:text-sm',
                            priority === 'critical' &&
                              'border-dynamic-red bg-dynamic-red/10 font-semibold text-dynamic-red hover:bg-dynamic-red/20'
                          )}
                          title="Priority — Alt+1 Urgent, Alt+2 High, Alt+3 Medium, Alt+4 Low, Alt+0 Clear"
                        >
                          <span className="truncate">
                            {priority
                              ? priority === 'critical'
                                ? '🔥 Urgent'
                                : priority === 'high'
                                  ? 'High'
                                  : priority === 'normal'
                                    ? 'Medium'
                                    : 'Low'
                              : 'Set priority'}
                          </span>
                          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[220px]">
                        {[
                          {
                            value: 'critical',
                            label: '🔥 Urgent',
                            dot: 'bg-dynamic-red',
                            className: 'font-semibold text-dynamic-red',
                          },
                          {
                            value: 'high',
                            label: 'High',
                            dot: 'bg-dynamic-orange',
                            className: '',
                          },
                          {
                            value: 'normal',
                            label: 'Medium',
                            dot: 'bg-dynamic-yellow',
                            className: '',
                          },
                          {
                            value: 'low',
                            label: 'Low',
                            dot: 'bg-dynamic-blue',
                            className: '',
                          },
                        ].map((opt) => (
                          <DropdownMenuItem
                            key={opt.value}
                            onClick={() =>
                              setPriority(opt.value as TaskPriority)
                            }
                            className={cn(
                              'cursor-pointer',
                              opt.className,
                              priority === opt.value &&
                                opt.value === 'critical' &&
                                'bg-dynamic-red/10'
                            )}
                          >
                            <span
                              className={cn(
                                'mr-2 inline-block h-2 w-2 rounded-full',
                                opt.dot
                              )}
                            />
                            <span className="flex-1">{opt.label}</span>
                            {priority === (opt.value as any) && (
                              <Check className="h-4 w-4" />
                            )}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem
                          onClick={() => setPriority(null)}
                          className="cursor-pointer text-dynamic-red focus:text-dynamic-red"
                        >
                          <X className="mr-2 h-4 w-4" /> Clear priority
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Estimation (Dropdown) */}
                  {boardConfig?.estimation_type && (
                    <div className="space-y-2.5 rounded-lg border border-border/60 bg-gradient-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm transition-shadow hover:shadow-md">
                      <Label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                          <Timer className="h-3.5 w-3.5 text-dynamic-orange" />
                        </div>
                        Estimation
                      </Label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            className="h-8 w-full justify-between text-xs transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 md:text-sm"
                            title="Estimation â€“ Alt+Shift+0..7 set, Alt+Shift+X clear"
                          >
                            <span className="truncate">
                              {typeof estimationPoints === 'number'
                                ? mapEstimationPoints(
                                    estimationPoints,
                                    boardConfig.estimation_type
                                  )
                                : 'Set estimation'}
                            </span>
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[220px]">
                          {estimationIndices.map((idx) => (
                            <DropdownMenuItem
                              key={idx}
                              onClick={() => updateEstimation(idx)}
                              className="cursor-pointer"
                            >
                              <span className="flex-1">
                                {mapEstimationPoints(
                                  idx,
                                  boardConfig.estimation_type
                                )}
                              </span>
                              {idx === estimationPoints && (
                                <Check className="h-4 w-4" />
                              )}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuItem
                            onClick={() => updateEstimation(null)}
                            className="cursor-pointer text-dynamic-red focus:text-dynamic-red"
                          >
                            <X className="mr-2 h-4 w-4" /> Clear estimation
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}

                  {/* Dates Module - Combined Start Date, Due Date, and Quick Actions */}
                  <div className="space-y-2.5 rounded-lg border border-border/60 bg-gradient-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm transition-shadow hover:shadow-md">
                    <Label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                      <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                        <Calendar className="h-3.5 w-3.5 text-dynamic-orange" />
                      </div>
                      Dates
                    </Label>
                    <div className="space-y-3">
                      {/* Start Date */}
                      <div className="space-y-1.5">
                        <Label className="font-normal text-muted-foreground text-xs">
                          Start Date
                        </Label>
                        <DateTimePicker
                          date={startDate}
                          setDate={setStartDate}
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
                        {startDate && endDate && startDate > endDate && (
                          <div className="flex items-center gap-2 rounded-md border border-dynamic-orange/30 bg-dynamic-orange/10 px-3 py-2 text-xs">
                            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-dynamic-orange" />
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
                              title="Today â€“ Alt+T"
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
                              title="Tomorrow â€“ Alt+M"
                            >
                              Tomorrow
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={() => {
                                const daysUntilEndOfWeek = 6 - dayjs().day();
                                handleQuickDueDate(daysUntilEndOfWeek);
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
                              title="Next week â€“ Alt+W"
                            >
                              Next week
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Advanced Options Toggle */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                    className="h-8 w-full justify-between text-muted-foreground text-xs transition-all hover:bg-dynamic-orange/5 hover:text-dynamic-orange"
                    title="Toggle advanced options â€“ Alt+A"
                  >
                    <span className="flex items-center gap-2">
                      <Settings className="h-3 w-3" />
                      {showAdvancedOptions ? 'Hide' : 'Show'} advanced options
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-3 w-3 transition-transform',
                        showAdvancedOptions && 'rotate-180'
                      )}
                    />
                  </Button>

                  {/* Advanced Options - Collapsible */}
                  {showAdvancedOptions && (
                    <div className="slide-in-from-top-2 animate-in space-y-4 duration-200">
                      {/* Labels Section */}
                      <div className="space-y-2.5 rounded-lg border border-border/60 bg-gradient-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm">
                        <Label className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 font-semibold text-foreground text-sm">
                            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                              <Tag className="h-3.5 w-3.5 text-dynamic-orange" />
                            </div>
                            Labels
                          </span>
                        </Label>
                        {boardConfig && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Input
                                placeholder="New label name"
                                value={newLabelName}
                                onChange={(e) =>
                                  setNewLabelName(e.target.value)
                                }
                                className="h-8 flex-1 text-xs transition-all focus:border-dynamic-orange/50"
                              />
                              <select
                                className="h-8 rounded-md border bg-background px-2 text-xs transition-all hover:border-dynamic-orange/50 focus:border-dynamic-orange/50 focus:outline-none focus:ring-1 focus:ring-dynamic-orange/20"
                                value={newLabelColor}
                                onChange={(e) =>
                                  setNewLabelColor(e.target.value)
                                }
                              >
                                {[
                                  'red',
                                  'orange',
                                  'yellow',
                                  'green',
                                  'blue',
                                  'indigo',
                                  'purple',
                                  'pink',
                                  'gray',
                                ].map((c) => (
                                  <option key={c} value={c}>
                                    {c.charAt(0).toUpperCase() + c.slice(1)}
                                  </option>
                                ))}
                              </select>
                              <Button
                                type="button"
                                size="xs"
                                className="h-8 bg-dynamic-orange px-3 text-white text-xs shadow-sm hover:bg-dynamic-orange/90"
                                onClick={handleCreateLabel}
                                disabled={creatingLabel || !newLabelName.trim()}
                              >
                                {creatingLabel ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  'Add'
                                )}
                              </Button>
                            </div>
                          </div>
                        )}

                        {labelsLoading ? (
                          <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-muted/30 py-6">
                            <Loader2 className="h-4 w-4 animate-spin text-dynamic-orange" />
                            <p className="text-muted-foreground text-xs">
                              Loading labels...
                            </p>
                          </div>
                        ) : availableLabels.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-muted-foreground/20 border-dashed bg-muted/20 py-6">
                            <Tag className="h-4 w-4 text-muted-foreground/40" />
                            <div className="text-center">
                              <p className="font-medium text-muted-foreground text-xs">
                                No labels yet
                              </p>
                              <p className="mt-1 text-[10px] text-muted-foreground/60">
                                Create your first label above
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 md:gap-2">
                            {availableLabels.map((label) => {
                              const active = selectedLabels.some(
                                (l) => l.id === label.id
                              );
                              const styles = computeAccessibleLabelStyles(
                                label.color
                              );
                              return (
                                <Button
                                  key={label.id}
                                  type="button"
                                  variant={active ? 'default' : 'outline'}
                                  size="xs"
                                  onClick={() => toggleLabel(label)}
                                  className={cn(
                                    'h-7 border px-3 text-xs transition-all',
                                    !active &&
                                      'bg-background hover:border-dynamic-orange/50',
                                    active && 'shadow-sm'
                                  )}
                                  style={
                                    active && styles
                                      ? {
                                          backgroundColor: styles.bg,
                                          borderColor: styles.border,
                                          color: styles.text,
                                        }
                                      : undefined
                                  }
                                >
                                  {label.name || 'Unnamed'}
                                  {active && <X className="ml-1.5 h-3 w-3" />}
                                </Button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Projects Section */}
                      <div className="space-y-2.5 rounded-lg border border-border/60 bg-gradient-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm">
                        <Label className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 font-semibold text-foreground text-sm">
                            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                              <Box className="h-3.5 w-3.5 text-dynamic-orange" />
                            </div>
                            Projects
                          </span>
                          {selectedProjects.length > 0 && (
                            <Badge
                              variant="secondary"
                              className="h-5 rounded-full px-2 font-semibold text-[10px]"
                            >
                              {selectedProjects.length}
                            </Badge>
                          )}
                        </Label>

                        {loadingProjects ? (
                          <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-muted/30 py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-dynamic-orange" />
                            <p className="text-muted-foreground text-xs">
                              Loading projects...
                            </p>
                          </div>
                        ) : taskProjects.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-muted-foreground/20 border-dashed bg-muted/20 py-8">
                            <Box className="h-5 w-5 text-muted-foreground/40" />
                            <p className="text-center text-muted-foreground text-xs">
                              No projects available
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {/* Search input */}
                            <div className="relative">
                              <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
                              <Input
                                type="text"
                                placeholder="Search projects..."
                                value={projectSearchQuery}
                                onChange={(e) =>
                                  setProjectSearchQuery(e.target.value)
                                }
                                className="h-8 border-muted-foreground/20 bg-background/50 pl-8 text-xs placeholder:text-muted-foreground/50"
                              />
                              {projectSearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setProjectSearchQuery('')}
                                  className="-translate-y-1/2 absolute top-1/2 right-2 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>

                            {/* Selected projects (if any) */}
                            {selectedProjects.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                                  Selected ({selectedProjects.length})
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {selectedProjects.map((project) => (
                                    <Button
                                      key={`selected-project-${project.id}`}
                                      type="button"
                                      variant="default"
                                      size="xs"
                                      onClick={() => toggleProject(project)}
                                      className="h-7 gap-1.5 rounded-full border border-dynamic-orange/30 bg-dynamic-orange/15 px-3 font-medium text-dynamic-orange text-xs shadow-sm transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/25"
                                    >
                                      {project.name}
                                      <X className="h-3 w-3 opacity-70" />
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Available projects */}
                            <div className="space-y-1.5">
                              {(() => {
                                const filteredProjects = taskProjects.filter(
                                  (project) => {
                                    const isSelected = selectedProjects.some(
                                      (p) => p.id === project.id
                                    );
                                    const matchesSearch =
                                      !projectSearchQuery ||
                                      (project.name || '')
                                        .toLowerCase()
                                        .includes(
                                          projectSearchQuery.toLowerCase()
                                        );
                                    return !isSelected && matchesSearch;
                                  }
                                );

                                if (filteredProjects.length === 0) {
                                  return projectSearchQuery ? (
                                    <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-muted/30 py-6">
                                      <Search className="h-4 w-4 text-muted-foreground/40" />
                                      <p className="text-center text-muted-foreground text-xs">
                                        No projects found
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="rounded-lg bg-muted/30 py-3 text-center">
                                      <p className="text-muted-foreground text-xs">
                                        All projects selected
                                      </p>
                                    </div>
                                  );
                                }

                                return (
                                  <>
                                    <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                                      Available ({filteredProjects.length})
                                    </p>
                                    <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                                      {filteredProjects.map((project) => (
                                        <button
                                          key={`available-project-${project.id}`}
                                          type="button"
                                          onClick={() => toggleProject(project)}
                                          className="group flex items-center gap-2.5 rounded-md border border-transparent bg-background/50 px-3 py-2 text-left transition-all hover:border-dynamic-orange/30 hover:bg-dynamic-orange/5"
                                        >
                                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-dynamic-orange/10">
                                            <ListTodo className="h-4 w-4 text-dynamic-orange" />
                                          </div>
                                          <div className="flex-1 truncate">
                                            <span className="block truncate text-sm">
                                              {project.name}
                                            </span>
                                            {project.status && (
                                              <span className="block text-muted-foreground text-xs">
                                                {project.status}
                                              </span>
                                            )}
                                          </div>
                                          <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Assignees Section */}
                      <div className="space-y-2.5 rounded-lg border border-border/60 bg-gradient-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm">
                        <Label className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 font-semibold text-foreground text-sm">
                            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                              <Users className="h-3.5 w-3.5 text-dynamic-orange" />
                            </div>
                            Assignees
                          </span>
                          {selectedAssignees.length > 0 && (
                            <Badge
                              variant="secondary"
                              className="h-5 rounded-full px-2 font-semibold text-[10px]"
                            >
                              {selectedAssignees.length}
                            </Badge>
                          )}
                        </Label>

                        {loadingMembers ? (
                          <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-muted/30 py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-dynamic-orange" />
                            <p className="text-muted-foreground text-xs">
                              Loading members...
                            </p>
                          </div>
                        ) : workspaceMembers.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-muted-foreground/20 border-dashed bg-muted/20 py-8">
                            <Users className="h-5 w-5 text-muted-foreground/40" />
                            <p className="text-center text-muted-foreground text-xs">
                              No workspace members
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {/* Search input */}
                            <div className="relative">
                              <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
                              <Input
                                type="text"
                                placeholder="Search members..."
                                value={assigneeSearchQuery}
                                onChange={(e) =>
                                  setAssigneeSearchQuery(e.target.value)
                                }
                                className="h-8 border-muted-foreground/20 bg-background/50 pl-8 text-xs placeholder:text-muted-foreground/50"
                              />
                              {assigneeSearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setAssigneeSearchQuery('')}
                                  className="-translate-y-1/2 absolute top-1/2 right-2 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>

                            {/* Selected assignees (if any) */}
                            {selectedAssignees.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                                  Selected ({selectedAssignees.length})
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {selectedAssignees.map((assignee) => (
                                    <Button
                                      key={`selected-assignee-${assignee.id || assignee.user_id}`}
                                      type="button"
                                      variant="default"
                                      size="xs"
                                      onClick={() => toggleAssignee(assignee)}
                                      className="h-7 gap-1.5 rounded-full border border-dynamic-orange/30 bg-dynamic-orange/15 px-3 font-medium text-dynamic-orange text-xs shadow-sm transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/25"
                                    >
                                      <Avatar className="h-4 w-4">
                                        <AvatarImage
                                          src={assignee.avatar_url}
                                          alt={
                                            assignee.display_name || 'Unknown'
                                          }
                                        />
                                        <AvatarFallback className="bg-dynamic-orange/20 font-bold text-[9px]">
                                          {(assignee.display_name ||
                                            'Unknown')[0]?.toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                      {assignee.display_name || 'Unknown'}
                                      <X className="h-3 w-3 opacity-70" />
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Available members */}
                            <div className="space-y-1.5">
                              {(() => {
                                const filteredMembers = workspaceMembers.filter(
                                  (member) => {
                                    const memberId =
                                      member.user_id || member.id;
                                    const isSelected = selectedAssignees.some(
                                      (a) => (a.id || a.user_id) === memberId
                                    );
                                    const matchesSearch =
                                      !assigneeSearchQuery ||
                                      (member.display_name || '')
                                        .toLowerCase()
                                        .includes(
                                          assigneeSearchQuery.toLowerCase()
                                        );
                                    return !isSelected && matchesSearch;
                                  }
                                );

                                if (filteredMembers.length === 0) {
                                  return assigneeSearchQuery ? (
                                    <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-muted/30 py-6">
                                      <Search className="h-4 w-4 text-muted-foreground/40" />
                                      <p className="text-center text-muted-foreground text-xs">
                                        No members found
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="rounded-lg bg-muted/30 py-3 text-center">
                                      <p className="text-muted-foreground text-xs">
                                        All members assigned
                                      </p>
                                    </div>
                                  );
                                }

                                return (
                                  <>
                                    <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                                      Available ({filteredMembers.length})
                                    </p>
                                    <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                                      {filteredMembers.map((member) => (
                                        <button
                                          key={`available-member-${member.user_id}`}
                                          type="button"
                                          onClick={() => toggleAssignee(member)}
                                          className="group flex items-center gap-2.5 rounded-md border border-transparent bg-background/50 px-3 py-2 text-left transition-all hover:border-dynamic-orange/30 hover:bg-dynamic-orange/5"
                                        >
                                          <Avatar className="h-7 w-7 shrink-0">
                                            <AvatarImage
                                              src={member.avatar_url}
                                              alt={
                                                member.display_name || 'Unknown'
                                              }
                                            />
                                            <AvatarFallback className="bg-muted font-semibold text-muted-foreground text-xs group-hover:bg-dynamic-orange/20 group-hover:text-dynamic-orange">
                                              {(member.display_name ||
                                                'Unknown')[0]?.toUpperCase()}
                                            </AvatarFallback>
                                          </Avatar>
                                          <span className="flex-1 truncate text-sm">
                                            {member.display_name || 'Unknown'}
                                          </span>
                                          <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Mobile floating save button */}
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

          {/* Overlay when sidebar is open */}
          {showOptionsSidebar && (
            <button
              type="button"
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
              onClick={() => setShowOptionsSidebar(false)}
              aria-label="Close sidebar"
            />
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
                    const supabase = createClient();
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
    </>
  );
}

export const TaskEditDialog = React.memo(TaskEditDialogComponent);
