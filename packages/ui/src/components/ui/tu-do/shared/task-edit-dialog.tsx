'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { Dialog, DialogContent, DialogTitle } from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import {
  Calendar,
  Check,
  ChevronDown,
  Flag,
  ListTodo,
  Loader2,
  Plus,
  Search,
  Settings,
  Tag,
  Timer,
  Trash,
  Users,
  X,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import {
  invalidateTaskCaches,
  useUpdateTask,
} from '@tuturuuu/utils/task-helper';
import { addDays } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildEstimationIndices,
  mapEstimationPoints,
} from './estimation-mapping';

interface TaskEditDialogProps {
  task: Task;
  boardId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
  availableLists?: TaskList[];
}

// Helper types
interface WorkspaceTaskLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

interface BoardEstimationConfig {
  estimation_type?: string | null;
  extended_estimation?: boolean;
  allow_zero_estimates?: boolean;
  count_unestimated_issues?: boolean;
}

function TaskEditDialogComponent({
  task,
  boardId,
  isOpen,
  onClose,
  onUpdate,
  availableLists: propAvailableLists,
  mode = 'edit',
}: TaskEditDialogProps & { mode?: 'edit' | 'create' }) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState<JSONContent | null>(() => {
    // Try to parse existing description as JSON, fallback to creating simple text content
    if (task.description) {
      try {
        return JSON.parse(task.description);
      } catch {
        // If it's not valid JSON, treat it as plain text and convert to JSONContent
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
    task.priority || null
  );
  const [startDate, setStartDate] = useState<Date | undefined>(
    task.start_date ? new Date(task.start_date) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    task.end_date ? new Date(task.end_date) : undefined
  );
  const [selectedListId, setSelectedListId] = useState<string>(task.list_id);
  const [estimationPoints, setEstimationPoints] = useState<
    number | null | undefined
  >(task.estimation_points ?? null);
  const [availableLabels, setAvailableLabels] = useState<WorkspaceTaskLabel[]>(
    []
  );
  const [selectedLabels, setSelectedLabels] = useState<WorkspaceTaskLabel[]>(
    task.labels || []
  );
  const [boardConfig, setBoardConfig] = useState<BoardEstimationConfig | null>(
    null
  );
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [, setEstimationSaving] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('gray');
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [createMultiple, setCreateMultiple] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selectedAssignees, setSelectedAssignees] = useState<any[]>(
    task.assignees || []
  );
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('');

  const queryClient = useQueryClient();
  const previousTaskIdRef = useRef<string | null>(null);
  const handleSaveRef = useRef<() => void>(() => {});
  const handleCloseRef = useRef<() => void>(() => {});
  const hasUnsavedChangesRef = useRef<boolean>(false);
  const quickDueRef = useRef<(days: number | null) => void>(() => {});
  const updateEstimationRef = useRef<(points: number | null) => void>(() => {});
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const flushEditorPendingRef = useRef<(() => JSONContent | null) | undefined>(
    undefined
  );

  // Use the React Query mutation hook for updating tasks
  const updateTaskMutation = useUpdateTask(boardId);

  // Fetch available task lists for the board (only if not provided as prop)
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

  // Helper function to convert description to JSONContent
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
  // Reset form when task changes or dialog opens
  useEffect(() => {
    // Update form if task ID changed OR if dialog just opened (for create mode with 'new' ID)
    if (
      previousTaskIdRef.current !== task.id ||
      (isOpen && task.id === 'new')
    ) {
      // For create mode, reset to task props (which should be empty for new tasks)
      // The draft restoration effect will run after this and override if needed
      if (isOpen && (mode === 'create' || task.id === 'new')) {
        setName(task.name || '');
        setDescription(parseDescription(task.description) || null);
        setPriority(task.priority || null);
        setStartDate(task.start_date ? new Date(task.start_date) : undefined);
        setEndDate(task.end_date ? new Date(task.end_date) : undefined);
        setSelectedListId(task.list_id);
        setEstimationPoints(task.estimation_points ?? null);
        setSelectedLabels(task.labels || []);
        setSelectedAssignees(task.assignees || []);
      } else {
        // Edit mode: load task data
        setName(task.name);
        setDescription(parseDescription(task.description));
        setPriority(task.priority || null);
        setStartDate(task.start_date ? new Date(task.start_date) : undefined);
        setEndDate(task.end_date ? new Date(task.end_date) : undefined);
        setSelectedListId(task.list_id);
        setEstimationPoints(task.estimation_points ?? null);
        setSelectedLabels(task.labels || []);
        setSelectedAssignees(task.assignees || []);
      }
      previousTaskIdRef.current = task.id;
    }
  }, [task, parseDescription, isOpen, mode]);

  // Reset transient edits when closing without saving in edit mode
  useEffect(() => {
    if (!isOpen && previousTaskIdRef.current && mode !== 'create') {
      setName(task.name);
      setDescription(parseDescription(task.description));
      setPriority(task.priority || null);
      setStartDate(task.start_date ? new Date(task.start_date) : undefined);
      setEndDate(task.end_date ? new Date(task.end_date) : undefined);
      setSelectedListId(task.list_id);
      setEstimationPoints(task.estimation_points ?? null);
      setSelectedLabels(task.labels || []);
      setSelectedAssignees(task.assignees || []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, task, parseDescription]);

  const fetchLabels = useCallback(async (wsId: string) => {
    try {
      setLabelsLoading(true);
      const supabase = createClient();
      const { data: labels, error: labelsErr } = await supabase
        .from('workspace_task_labels')
        .select('id,name,color,created_at')
        .eq('ws_id', wsId)
        .order('created_at');
      if (!labelsErr && labels)
        setAvailableLabels(
          (labels as any).sort((a: any, b: any) =>
            (a?.name || '')
              .toLowerCase()
              .localeCompare((b?.name || '').toLowerCase())
          )
        );
    } catch (e) {
      console.error('Failed fetching labels', e);
    } finally {
      setLabelsLoading(false);
    }
  }, []);

  const fetchWorkspaceMembers = useCallback(async (wsId: string) => {
    console.log('🔍 Fetching workspace members for wsId:', wsId);
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
        console.log('📋 Fetched workspace members:', members);
        // Transform and sort by display_name
        const transformedMembers = members.map((m: any) => ({
          user_id: m.user_id,
          display_name: m.users?.display_name || 'Unknown User',
          avatar_url: m.users?.avatar_url,
        }));

        // Deduplicate by user_id to ensure unique keys
        const uniqueMembers = Array.from(
          new Map(transformedMembers.map(m => [m.user_id, m])).values()
        );

        const sortedMembers = uniqueMembers.sort((a, b) =>
          (a.display_name || '').localeCompare(b.display_name || '')
        );
        console.log('✅ Setting workspace members:', sortedMembers);
        setWorkspaceMembers(sortedMembers);
      } else {
        console.log('⚠️ No members data returned');
      }
    } catch (e) {
      console.error('Failed fetching workspace members', e);
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  // Fetch board estimation config & labels on open - memoize to prevent unnecessary re-runs
  const fetchBoardConfig = useCallback(async () => {
    if (!isOpen) return;
    try {
      const supabase = createClient();
      const { data: board, error: boardErr } = await supabase
        .from('workspace_boards')
        .select(
          'estimation_type, extended_estimation, allow_zero_estimates, count_unestimated_issues, ws_id'
        )
        .eq('id', boardId)
        .single();
      if (boardErr) throw boardErr;
      setBoardConfig(board as any);
      const wsId = (board as any)?.ws_id;
      if (wsId) {
        setWorkspaceId(wsId);
        await Promise.all([fetchLabels(wsId), fetchWorkspaceMembers(wsId)]);
      }
    } catch (e) {
      console.error('Failed loading board config or labels', e);
    }
  }, [isOpen, boardId, fetchLabels, fetchWorkspaceMembers]);

  useEffect(() => {
    fetchBoardConfig();
  }, [fetchBoardConfig]);

  // ------- Draft persistence (create mode) -------------------------------------
  const draftStorageKey = useMemo(
    () => `tu-do:task-draft:${boardId}`,
    [boardId]
  );
  const isCreateMode = mode === 'create';

  // Load draft when opening in create mode (skip for edit mode)
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
        // Only restore if draft has meaningful content
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
          // Clear empty draft
          if (typeof window !== 'undefined')
            localStorage.removeItem(draftStorageKey);
          return;
        }

        if (typeof draft.name === 'string') setName(draft.name);
        if (draft.description != null) {
          try {
            // Accept either JSONContent or serialized string
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
    } catch {
      // ignore draft load errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isCreateMode, draftStorageKey]);

  // Ensure origin list from the entry point is respected in create mode
  useEffect(() => {
    if (isOpen && isCreateMode && task.list_id) {
      setSelectedListId(task.list_id);
    }
  }, [isOpen, isCreateMode, task.list_id]);

  // If opening in edit mode, proactively clear any stale create draft for this board
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
      // Clear empty draft to avoid stale noise
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
      } catch {
        // ignore save errors
      }
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

  // Build initial and current snapshots for change detection
  const initialSnapshot = useMemo(() => {
    return {
      name: (task.name || '').trim(),
      description: JSON.stringify(parseDescription(task.description) || null),
      priority: task.priority || null,
      start: task.start_date
        ? new Date(task.start_date).toISOString()
        : undefined,
      end: task.end_date ? new Date(task.end_date).toISOString() : undefined,
      listId: task.list_id,
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
    } as const;
  }, [name, description, priority, startDate, endDate, selectedListId]);

  const hasUnsavedChanges = useMemo(() => {
    return (
      initialSnapshot.name !== currentSnapshot.name ||
      initialSnapshot.description !== currentSnapshot.description ||
      initialSnapshot.priority !== currentSnapshot.priority ||
      initialSnapshot.start !== currentSnapshot.start ||
      initialSnapshot.end !== currentSnapshot.end ||
      initialSnapshot.listId !== currentSnapshot.listId
    );
  }, [initialSnapshot, currentSnapshot]);

  const canSave = useMemo(() => {
    const hasName = !!(name || '').trim();
    if (mode === 'create') return hasName && !isLoading;
    return hasName && hasUnsavedChanges && !isLoading;
  }, [mode, name, hasUnsavedChanges, isLoading]);

  // Global keyboard shortcuts: Cmd/Ctrl + Enter to save, Cmd/Ctrl + Delete to delete
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Save shortcut: Cmd/Ctrl + Enter
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (canSave) {
          handleSaveRef.current();
        } else if (!hasUnsavedChangesRef.current) {
          handleCloseRef.current();
        }
        return;
      }

      // Delete shortcut: Cmd/Ctrl + Delete (only in edit mode)
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === 'Delete' || e.key === 'Backspace') &&
        mode === 'edit'
      ) {
        e.preventDefault();
        setShowDeleteConfirm(true);
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, canSave, mode]);

  const handleCreateLabel = async () => {
    if (!newLabelName.trim() || !boardConfig) return;
    // Need workspace id from boardConfig; we re-fetch board already, store ws_id inside boardConfig? not persisted previously; fallback fetch if absent
    setCreatingLabel(true);
    try {
      const supabase = createClient();
      // Ensure we have ws_id
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
        // auto-select new label (maintain alphabetical order in selection list too)
        setSelectedLabels((prev) =>
          [data as any, ...prev].sort((a, b) =>
            (a?.name || '')
              .toLowerCase()
              .localeCompare((b?.name || '').toLowerCase())
          )
        );

        // Attempt to link label to this task in DB
        const { error: linkErr } = await supabase
          .from('task_labels')
          .insert({ task_id: task.id, label_id: (data as any).id });
        if (linkErr) {
          // Rollback local selection if link fails
          setSelectedLabels((prev) =>
            prev.filter((l) => l.id !== (data as any).id)
          );
          toast({
            title: 'Label created (not linked)',
            description: 'Label saved but could not be attached to task.',
            variant: 'destructive',
          });
        } else {
          // Invalidate caches so parent task list reflects new label
          invalidateTaskCaches(queryClient, boardId);
          onUpdate();
          // Dispatch global event so other open components can refresh
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
  };

  // End date change helper (preserve 23:59 default if only date picked)
  const handleEndDateChange = (date: Date | undefined) => {
    if (date) {
      const selectedDate = new Date(date);
      if (
        selectedDate.getHours() === 0 &&
        selectedDate.getMinutes() === 0 &&
        selectedDate.getSeconds() === 0 &&
        selectedDate.getMilliseconds() === 0
      ) {
        selectedDate.setHours(23, 59, 59, 999);
      }
      setEndDate(selectedDate);
    } else {
      setEndDate(undefined);
    }
  };

  // Quick due date setter (today, tomorrow, etc.)
  const handleQuickDueDate = (days: number | null) => {
    let newDate: Date | undefined;
    if (days !== null) {
      const target = addDays(new Date(), days);
      target.setHours(23, 59, 59, 999);
      newDate = target;
    }
    setEndDate(newDate);
    if (mode === 'create') {
      // Defer persistence to save
      return;
    }
    setIsLoading(true);
    const taskUpdates: Partial<Task> = { end_date: newDate?.toISOString() };
    updateTaskMutation.mutate(
      { taskId: task.id, updates: taskUpdates },
      {
        onSuccess: () => {
          invalidateTaskCaches(queryClient, boardId);
          toast({
            title: 'Due date updated',
            description: newDate
              ? `Due date set to ${newDate.toLocaleDateString()}`
              : 'Due date removed',
          });
          onUpdate();
          onClose();
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
  };

  // Handle estimation save (optimistic local update + API call)
  const updateEstimation = async (points: number | null) => {
    if (points === estimationPoints) return;
    setEstimationPoints(points);
    if (mode === 'create') {
      // Will be saved on create
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
      invalidateTaskCaches(queryClient, boardId);
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
  };

  // Label selection handlers
  // Handle image upload to Supabase storage
  const handleImageUpload = useCallback(
    async (file: File): Promise<string> => {
      if (!workspaceId) {
        throw new Error('Workspace ID not found');
      }

      const supabase = createClient();

      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${workspaceId}/task-images/${fileName}`;

      // Upload to Supabase storage
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

      // Get signed URL (valid for 1 year)
      const { data: signedUrlData, error: signedUrlError } =
        await supabase.storage
          .from('workspaces')
          .createSignedUrl(data.path, 31536000); // 365 days in seconds

      if (signedUrlError) {
        console.error('Signed URL error:', signedUrlError);
        throw new Error('Failed to generate signed URL');
      }

      return signedUrlData.signedUrl;
    },
    [workspaceId]
  );

  const toggleLabel = async (label: WorkspaceTaskLabel) => {
    const exists = selectedLabels.some((l) => l.id === label.id);
    const supabase = createClient();
    try {
      if (mode === 'create') {
        // Local toggle only; persist on create
        setSelectedLabels((prev) =>
          exists ? prev.filter((l) => l.id !== label.id) : [label, ...prev]
        );
        return;
      }
      if (exists) {
        // remove
        const { error } = await supabase
          .from('task_labels')
          .delete()
          .eq('task_id', task.id)
          .eq('label_id', label.id);
        if (error) throw error;
        setSelectedLabels((prev) => prev.filter((l) => l.id !== label.id));
      } else {
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
      invalidateTaskCaches(queryClient, boardId);
    } catch (e: any) {
      toast({
        title: 'Label update failed',
        description: e.message || 'Unable to update labels',
        variant: 'destructive',
      });
    }
  };

  const toggleAssignee = async (member: any) => {
    const exists = selectedAssignees.some((a) => a.user_id === member.user_id);
    const supabase = createClient();
    try {
      if (mode === 'create') {
        // Local toggle only; persist on create
        setSelectedAssignees((prev) =>
          exists
            ? prev.filter((a) => a.user_id !== member.user_id)
            : [...prev, member]
        );
        return;
      }
      if (exists) {
        // remove
        const { error } = await supabase
          .from('task_assignees')
          .delete()
          .eq('task_id', task.id)
          .eq('user_id', member.user_id);
        if (error) throw error;
        setSelectedAssignees((prev) =>
          prev.filter((a) => a.user_id !== member.user_id)
        );
      } else {
        const { error } = await supabase
          .from('task_assignees')
          .insert({ task_id: task.id, user_id: member.user_id });
        if (error) throw error;
        setSelectedAssignees((prev) => [...prev, member]);
      }
      invalidateTaskCaches(queryClient, boardId);
      onUpdate();
    } catch (e: any) {
      toast({
        title: 'Assignee update failed',
        description: e.message || 'Unable to update assignees',
        variant: 'destructive',
      });
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    // Flush any pending editor changes before saving and get current content
    let currentDescription = description;
    if (flushEditorPendingRef.current) {
      const flushedContent = flushEditorPendingRef.current();
      // Use the flushed content directly
      currentDescription = flushedContent;
    }

    setIsSaving(true);
    setIsLoading(true);

    // Immediately clear draft and cancel any pending saves
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    try {
      if (typeof window !== 'undefined')
        localStorage.removeItem(draftStorageKey);
      setHasDraft(false);
    } catch {}

    // Convert JSONContent to string for storage
    // Important: Use null explicitly instead of undefined to ensure DB field is cleared
    const descriptionString: string | null = currentDescription
      ? JSON.stringify(currentDescription)
      : null;

    if (mode === 'create') {
      try {
        const supabase = createClient();
        const { createTask } = await import('@tuturuuu/utils/task-helper');
        const taskData: Partial<Task> = {
          name: name.trim(),
          description: descriptionString,
          priority: priority,
          start_date: startDate?.toISOString(),
          end_date: endDate?.toISOString(),
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

        invalidateTaskCaches(queryClient, boardId);
        toast({ title: 'Task created', description: 'New task added.' });
        onUpdate();
        if (createMultiple) {
          // Reset for next task: only clear title and description; persist others
          setName('');
          setDescription(null);
          // Focus name input on next tick for quick entry
          setTimeout(() => {
            const input = document.querySelector<HTMLInputElement>(
              'input[placeholder="What needs to be done?"]'
            );
            input?.focus();
          }, 0);
        } else {
          // Reset all form state before closing to prevent stale data on next open
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

    // Prepare task updates (edit mode)
    // Note: We need to include description even if it's null to clear it in the database
    const taskUpdates: any = {
      name: name.trim(),
      description: descriptionString, // Explicitly null when empty, not undefined
      priority: priority,
      start_date: startDate?.toISOString(),
      end_date: endDate?.toISOString(),
      list_id: selectedListId,
    };

    updateTaskMutation.mutate(
      {
        taskId: task.id,
        updates: taskUpdates,
      },
      {
        onSuccess: () => {
          // Force cache invalidation
          invalidateTaskCaches(queryClient, boardId);

          toast({
            title: 'Task updated',
            description: 'The task has been successfully updated.',
          });
          onUpdate();
          onClose();
        },
        onError: (error) => {
          console.error('Error updating task:', error);
          toast({
            title: 'Error updating task',
            description: error.message || 'Please try again later',
            variant: 'destructive',
          });
        },
        onSettled: () => {
          setIsLoading(false);
          setIsSaving(false);
        },
      }
    );
  };
  // Keep the ref pointing to the latest handleSave on every render (no hook deps warnings)
  handleSaveRef.current = handleSave;

  const handleClose = () => {
    if (!isLoading) {
      // If closing from edit mode, clear any stale create draft to avoid unintended restoration
      try {
        if (!isCreateMode && typeof window !== 'undefined') {
          localStorage.removeItem(draftStorageKey);
        }
      } catch {}
      onClose();
    }
  };

  // Keep stable refs for handlers and change state
  handleSaveRef.current = handleSave;
  handleCloseRef.current = handleClose;
  hasUnsavedChangesRef.current = hasUnsavedChanges;
  quickDueRef.current = handleQuickDueDate;
  updateEstimationRef.current = updateEstimation;

  // Handle escape key - disabled to let Radix handle it
  // useEffect(() => {
  //   const handleEscape = (e: KeyboardEvent) => {
  //     if (e.key === 'Escape' && !isLoading) {
  //       handleClose();
  //     }
  //   };

  //   if (isOpen) {
  //     window.addEventListener('keydown', handleEscape);
  //     return () => window.removeEventListener('keydown', handleEscape);
  //   }
  // }, [isOpen, isLoading, handleClose]);

  // Keyboard shortcuts for options (Alt-based). Skips when typing in inputs/contenteditable.
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

      // Priority: Alt+1/2/3/4, Alt+0 clear
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

      // Due date: Alt+T/M/W set, Alt+D clear
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

      // Advanced toggle: Alt+A
      if (lower === 'a') {
        e.preventDefault();
        setShowAdvancedOptions((prev) => !prev);
        return;
      }

      // Estimation: Alt+Shift+0..7 set index, Alt+Shift+X clear
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
    // Intentionally not depending on handleQuickDueDate/updateEstimation to avoid re-binding on every render.
    // They are stable enough for user interactions and not critical for stale closure risks here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, boardConfig?.estimation_type]);

  // Label color utilities (matching task-labels-display.tsx approach)
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
    return '#' + c.toLowerCase();
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
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
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
    const bg = baseHex + '1a'; // 10% opacity
    const border = baseHex + '4d'; // 30% opacity
    let text = baseHex;
    if (lum < 0.22) {
      text = adjust(baseHex, 1.25);
    } else if (lum > 0.82) {
      text = adjust(baseHex, 0.65);
    }
    return { bg, border, text };
  };

  // Build estimation indices via shared util - memoize to prevent recalculation
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

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) handleClose();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleDialogOpenChange} modal={true}>
        <DialogContent
          showCloseButton={false}
          className="!inset-0 !top-0 !left-0 !max-w-none !translate-x-0 !translate-y-0 !rounded-none data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2 flex h-screen max-h-screen w-screen gap-0 border-0 p-0"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {/* Main content area - Task title and description */}
          <div className="flex min-w-0 flex-1 flex-col bg-background">
            {/* Enhanced Header with gradient */}
            <div className="flex items-center justify-between border-b bg-gradient-to-r from-dynamic-orange/5 via-background to-background px-4 py-3 backdrop-blur-sm md:px-8 md:py-4">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-orange/10 ring-1 ring-dynamic-orange/20">
                  <ListTodo className="h-4 w-4 text-dynamic-orange" />
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <DialogTitle className="truncate font-semibold text-base text-foreground md:text-lg">
                    {mode === 'create' ? 'Create New Task' : 'Edit Task'}
                  </DialogTitle>
                </div>
              </div>
              <div className="flex items-center gap-1 md:gap-2">
                {isCreateMode && (
                  <label className="hidden items-center gap-2 text-muted-foreground text-xs md:flex">
                    <Switch
                      checked={createMultiple}
                      onCheckedChange={(v) => setCreateMultiple(Boolean(v))}
                    />
                    Create multiple
                  </label>
                )}
                {mode !== 'create' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-dynamic-red"
                    onClick={() => setShowDeleteConfirm(true)}
                    title="Delete task"
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
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
                          {mode === 'create' ? 'Create Task' : 'Save Changes'}
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
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="mx-auto flex h-full min-h-full w-full flex-col">
                {/* Task Name - Large and prominent with underline effect */}
                <div className="group">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="What needs to be done?"
                    className="h-auto border-0 bg-transparent p-4 font-bold text-2xl text-foreground leading-tight tracking-tight transition-colors placeholder:text-muted-foreground/30 focus-visible:outline-0 focus-visible:ring-0 md:px-8 md:pt-10 md:pb-6 md:text-2xl"
                    autoFocus
                  />
                </div>

                {/* Task Description - Full editor experience with subtle border */}
                <RichTextEditor
                  content={description}
                  onChange={setDescription}
                  writePlaceholder="Add a detailed description, attach files, or use markdown..."
                  titlePlaceholder=""
                  className="h-full border-0 bg-transparent px-4 focus-visible:outline-0 focus-visible:ring-0 md:px-8"
                  workspaceId={workspaceId || undefined}
                  onImageUpload={handleImageUpload}
                  flushPendingRef={flushEditorPendingRef}
                />
              </div>
            </div>
          </div>

          {/* Simplified Right sidebar - hidden on mobile by default */}
          <div
            className={cn(
              'fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background shadow-lg transition-transform duration-300 sm:w-[380px] md:relative md:z-auto md:translate-x-0 md:bg-gradient-to-b md:from-muted/20 md:to-muted/5 md:shadow-none',
              showMobileSidebar
                ? 'translate-x-0'
                : 'translate-x-full md:translate-x-0'
            )}
          >
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
                {/* Close button for mobile */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 md:hidden"
                  onClick={() => setShowMobileSidebar(false)}
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
                        title="Priority – Alt+1 Urgent, Alt+2 High, Alt+3 Medium, Alt+4 Low, Alt+0 Clear"
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
                          onClick={() => setPriority(opt.value as TaskPriority)}
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
                          title="Estimation – Alt+Shift+0..7 set, Alt+Shift+X clear"
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

                {/* Quick Due Date */}
                <div className="space-y-2.5 rounded-lg border border-border/60 bg-gradient-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm transition-shadow hover:shadow-md">
                  <Label className="flex items-center justify-between gap-2 font-semibold text-foreground text-sm">
                    <span className="flex items-center gap-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                        <Calendar className="h-3.5 w-3.5 text-dynamic-orange" />
                      </div>
                      Due Date
                    </span>
                    <span className="flex items-center gap-3">
                      {endDate && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleQuickDueDate(null)}
                          disabled={isLoading}
                          className="h-6 w-6 text-muted-foreground hover:text-dynamic-red"
                          title="Clear due date"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </span>
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
                      onClick={() => handleQuickDueDate(7)}
                      disabled={isLoading}
                      className="h-7 text-[11px] transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 md:text-xs"
                      title="Next week – Alt+W"
                    >
                      Next week
                    </Button>
                  </div>
                </div>

                {/* Advanced Options Toggle */}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className="h-8 w-full justify-between text-muted-foreground text-xs transition-all hover:bg-dynamic-orange/5 hover:text-dynamic-orange"
                  title="Toggle advanced options – Alt+A"
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
                    {/* Custom Date Pickers */}
                    <div className="space-y-2.5 rounded-lg border border-border/60 bg-gradient-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm">
                      <Label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                          <Calendar className="h-3.5 w-3.5 text-dynamic-orange" />
                        </div>
                        Dates
                      </Label>
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <Label className="font-normal text-muted-foreground text-xs">
                            Start Date
                          </Label>
                          <DateTimePicker
                            date={startDate}
                            setDate={setStartDate}
                            showTimeSelect={true}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="font-normal text-muted-foreground text-xs">
                            Due Date
                          </Label>
                          <DateTimePicker
                            date={endDate}
                            setDate={handleEndDateChange}
                            showTimeSelect={true}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Estimation Section moved above as dropdown */}

                    {/* Labels Section */}
                    <div className="space-y-2.5 rounded-lg border border-border/60 bg-gradient-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm">
                      <Label className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 font-semibold text-foreground text-sm">
                          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                            <Tag className="h-3.5 w-3.5 text-dynamic-orange" />
                          </div>
                          Labels
                        </span>
                        {boardConfig && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-muted-foreground transition-colors hover:text-dynamic-orange"
                            onClick={() =>
                              (boardConfig as any)?.ws_id &&
                              fetchLabels((boardConfig as any).ws_id)
                            }
                            disabled={labelsLoading}
                          >
                            {labelsLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              'Refresh'
                            )}
                          </Button>
                        )}
                      </Label>
                      {boardConfig && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder="New label name"
                              value={newLabelName}
                              onChange={(e) => setNewLabelName(e.target.value)}
                              className="h-8 flex-1 text-xs transition-all focus:border-dynamic-orange/50"
                            />
                            <select
                              className="h-8 rounded-md border bg-background px-2 text-xs transition-all hover:border-dynamic-orange/50 focus:border-dynamic-orange/50 focus:outline-none focus:ring-1 focus:ring-dynamic-orange/20"
                              value={newLabelColor}
                              onChange={(e) => setNewLabelColor(e.target.value)}
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
                                    key={assignee.user_id}
                                    type="button"
                                    variant="default"
                                    size="xs"
                                    onClick={() => toggleAssignee(assignee)}
                                    className="h-7 gap-1.5 rounded-full border border-dynamic-orange/30 bg-dynamic-orange/15 px-3 font-medium text-dynamic-orange text-xs shadow-sm transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/25"
                                  >
                                    <Avatar className="h-4 w-4">
                                      <AvatarImage
                                        src={assignee.avatar_url}
                                        alt={assignee.display_name || 'Unknown'}
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
                                  const isSelected = selectedAssignees.some(
                                    (a) => a.user_id === member.user_id
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
                                        key={member.user_id}
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

          {/* Mobile floating action buttons */}
          <div className="fixed right-4 bottom-4 z-40 flex flex-col gap-2 md:hidden">
            {/* Save button */}
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
            {/* Options button */}
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setShowMobileSidebar(true)}
              className="h-14 w-14 rounded-full shadow-lg"
            >
              <Settings className="h-6 w-6" />
            </Button>
          </div>

          {/* Mobile overlay */}
          {showMobileSidebar && (
            <button
              type="button"
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
              onClick={() => setShowMobileSidebar(false)}
              aria-label="Close sidebar"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
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
              <p className="mt-1 text-muted-foreground text-sm">
                This action cannot be undone. The task will be permanently
                removed.
              </p>
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
              onClick={async () => {
                try {
                  const supabase = createClient();
                  const { error } = await supabase
                    .from('tasks')
                    .delete()
                    .eq('id', task.id);
                  if (error) throw error;
                  invalidateTaskCaches(queryClient, boardId);
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

export function TaskEditDialog(
  props: TaskEditDialogProps & { mode?: 'edit' | 'create' }
) {
  return <TaskEditDialogComponent {...props} />;
}
