'use client';

import type { JSONContent } from '@tiptap/react';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type React from 'react';
import { useEffect, useRef } from 'react';
import type { TaskFilters } from '../../types';
import type { WorkspaceTaskLabel } from '../types';
import { getDescriptionContent } from '../utils';

// Module-level singleton to avoid repeated instantiation
const supabase = createClient();

export interface WorkspaceAssignee {
  id: string;
  user_id?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
}

export interface WorkspaceProject {
  id: string;
  name: string;
}

export interface UseTaskFormResetProps {
  isOpen: boolean;
  isCreateMode: boolean;
  task?: Task;
  filters?: TaskFilters;

  // State setters - using React dispatch types for compatibility
  setName: React.Dispatch<React.SetStateAction<string>>;
  setDescription: React.Dispatch<React.SetStateAction<JSONContent | null>>;
  setPriority: React.Dispatch<
    React.SetStateAction<'critical' | 'high' | 'low' | 'normal' | null>
  >;
  setStartDate: React.Dispatch<React.SetStateAction<Date | undefined>>;
  setEndDate: React.Dispatch<React.SetStateAction<Date | undefined>>;
  setSelectedListId: React.Dispatch<React.SetStateAction<string>>;
  setEstimationPoints: React.Dispatch<
    React.SetStateAction<number | null | undefined>
  >;
  setSelectedLabels: React.Dispatch<React.SetStateAction<WorkspaceTaskLabel[]>>;
  setSelectedAssignees: React.Dispatch<
    React.SetStateAction<WorkspaceAssignee[]>
  >;
  setSelectedProjects: React.Dispatch<React.SetStateAction<WorkspaceProject[]>>;
}

export function useTaskFormReset({
  isOpen,
  isCreateMode,
  task,
  filters,
  setName,
  setDescription,
  setPriority,
  setStartDate,
  setEndDate,
  setSelectedListId,
  setEstimationPoints,
  setSelectedLabels,
  setSelectedAssignees,
  setSelectedProjects,
}: UseTaskFormResetProps): void {
  const previousTaskIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

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
  }, [
    isCreateMode,
    isOpen,
    task,
    filters,
    setName,
    setDescription,
    setPriority,
    setStartDate,
    setEndDate,
    setSelectedListId,
    setEstimationPoints,
    setSelectedLabels,
    setSelectedAssignees,
    setSelectedProjects,
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
  }, [
    isOpen,
    isCreateMode,
    task,
    setName,
    setDescription,
    setPriority,
    setStartDate,
    setEndDate,
    setSelectedListId,
    setEstimationPoints,
    setSelectedLabels,
    setSelectedAssignees,
    setSelectedProjects,
  ]);

  // Apply filters when dialog opens in create mode
  useEffect(() => {
    isMountedRef.current = true;

    if (isOpen && isCreateMode && filters) {
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

    return () => {
      isMountedRef.current = false;
    };
  }, [
    isOpen,
    isCreateMode,
    filters,
    setPriority,
    setSelectedLabels,
    setSelectedAssignees,
    setSelectedProjects,
  ]);
}
