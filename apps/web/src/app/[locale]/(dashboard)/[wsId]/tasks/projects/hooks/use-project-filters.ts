'use client';

import useSearchParams from '@tuturuuu/ui/hooks/useSearchParams';
import { useMemo, type Dispatch, type SetStateAction } from 'react';
import type { TaskProject, ViewMode, SortBy, SortOrder } from '../types';

const VALID_VIEW_MODES: ViewMode[] = ['list', 'grid'];
const VALID_SORT_BY: SortBy[] = [
  'created_at',
  'name',
  'status',
  'priority',
  'health_status',
  'tasks_count',
];
const VALID_SORT_ORDER: SortOrder[] = ['asc', 'desc'];

export function useProjectFilters(projects: TaskProject[]) {
  const { getSingle, get, set } = useSearchParams();

  // Read from URL with validation and defaults
  const viewMode = (
    VALID_VIEW_MODES.includes(getSingle('view') as ViewMode)
      ? getSingle('view')
      : 'list'
  ) as ViewMode;

  const sortBy = (
    VALID_SORT_BY.includes(getSingle('sort') as SortBy)
      ? getSingle('sort')
      : 'created_at'
  ) as SortBy;

  const sortOrder = (
    VALID_SORT_ORDER.includes(getSingle('order') as SortOrder)
      ? getSingle('order')
      : 'desc'
  ) as SortOrder;

  const searchQuery = getSingle('q') ?? '';

  // Array filters
  const statusFilter = (get('status') as string[]) ?? [];
  const priorityFilter = (get('priority') as string[]) ?? [];
  const healthFilter = (get('health') as string[]) ?? [];

  // Setters that update URL (with refresh=false to avoid full page reload)
  const setViewMode = (mode: ViewMode) => set({ view: mode }, false);
  const setSortBy = (sort: SortBy) => set({ sort }, false);
  const setSortOrder = (order: SortOrder) => set({ order }, false);
  const setSearchQuery = (q: string) => set({ q: q || undefined }, false);

  const setStatusFilter: Dispatch<SetStateAction<string[]>> = (value) => {
    const newValue = typeof value === 'function' ? value(statusFilter) : value;
    set({ status: newValue.length ? newValue : undefined }, false);
  };

  const setPriorityFilter: Dispatch<SetStateAction<string[]>> = (value) => {
    const newValue =
      typeof value === 'function' ? value(priorityFilter) : value;
    set({ priority: newValue.length ? newValue : undefined }, false);
  };

  const setHealthFilter: Dispatch<SetStateAction<string[]>> = (value) => {
    const newValue = typeof value === 'function' ? value(healthFilter) : value;
    set({ health: newValue.length ? newValue : undefined }, false);
  };

  // Computed values
  const hasActiveFilters =
    statusFilter.length > 0 ||
    priorityFilter.length > 0 ||
    healthFilter.length > 0;

  const clearFilters = () => {
    set(
      {
        status: undefined,
        priority: undefined,
        health: undefined,
        q: undefined, // Clear search query too
      },
      false
    );
  };

  // Filtered and sorted projects
  const filteredProjects = useMemo(() => {
    let result = projects;

    // Search filter
    if (searchQuery) {
      result = result.filter(
        (project) =>
          project.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          project.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter.length > 0) {
      result = result.filter((project) =>
        project.status ? statusFilter.includes(project.status) : false
      );
    }

    // Priority filter
    if (priorityFilter.length > 0) {
      result = result.filter((project) =>
        project.priority ? priorityFilter.includes(project.priority) : false
      );
    }

    // Health filter
    if (healthFilter.length > 0) {
      result = result.filter((project) =>
        project.health_status
          ? healthFilter.includes(project.health_status)
          : false
      );
    }

    const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
    const healthOrder = { off_track: 3, at_risk: 2, on_track: 1 };
    // Sort
    result = [...result].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortBy) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'status':
          aVal = a.status ?? '';
          bVal = b.status ?? '';
          break;
        case 'priority':
          aVal = a.priority
            ? (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 0)
            : 0;
          bVal = b.priority
            ? (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 0)
            : 0;
          break;
        case 'health_status':
          aVal = a.health_status
            ? (healthOrder[a.health_status as keyof typeof healthOrder] ?? 0)
            : 0;
          bVal = b.health_status
            ? (healthOrder[b.health_status as keyof typeof healthOrder] ?? 0)
            : 0;
          break;
        case 'tasks_count':
          aVal = a.tasksCount;
          bVal = b.tasksCount;
          break;
        case 'created_at':
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    return result;
  }, [
    projects,
    searchQuery,
    statusFilter,
    priorityFilter,
    healthFilter,
    sortBy,
    sortOrder,
  ]);

  return {
    // View controls
    viewMode,
    setViewMode,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    searchQuery,
    setSearchQuery,

    // Filters
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    healthFilter,
    setHealthFilter,

    // Computed
    filteredProjects,
    hasActiveFilters,
    clearFilters,
  };
}
