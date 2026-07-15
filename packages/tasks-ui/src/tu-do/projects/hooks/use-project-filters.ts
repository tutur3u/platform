'use client';

import useSearchParams from '@tuturuuu/ui/hooks/useSearchParams';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
} from 'react';
import type { SortBy, SortOrder, TaskProject, ViewMode } from '../types';

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

const validateParam = <T extends string>(
  value: string | undefined,
  validValues: readonly T[],
  defaultValue: T
) => {
  return validValues.includes(value as T) ? (value as T) : defaultValue;
};

export function useProjectFilters(projects: TaskProject[]) {
  const { getSingle, get, set } = useSearchParams();

  // Read from URL with validation and defaults
  const viewMode = validateParam(
    getSingle('view'),
    VALID_VIEW_MODES,
    'list'
  ) as ViewMode;

  const sortBy = validateParam(
    getSingle('sort'),
    VALID_SORT_BY,
    'created_at'
  ) as SortBy;

  const sortOrder = validateParam(
    getSingle('order'),
    VALID_SORT_ORDER,
    'desc'
  ) as SortOrder;

  const searchQuery = getSingle('q') ?? '';

  // Array filters
  const normalizeArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return [value];
    return [];
  };
  const statusFilter = normalizeArray(get('status'));
  const priorityFilter = normalizeArray(get('priority'));
  const healthFilter = normalizeArray(get('health'));

  // Setters that update URL (with refresh=false to avoid full page reload)
  const setViewMode = useCallback(
    (mode: ViewMode) => set({ view: mode }, false),
    [set]
  );
  const setSortBy = useCallback((sort: SortBy) => set({ sort }, false), [set]);
  const setSortOrder = useCallback(
    (order: SortOrder) => set({ order }, false),
    [set]
  );
  const setSearchQuery = useCallback(
    (q: string) => set({ q: q || undefined }, false),
    [set]
  );

  const setStatusFilter: Dispatch<SetStateAction<string[]>> = useCallback(
    (value) => {
      const currentValue = statusFilter;
      const newValue =
        typeof value === 'function' ? value(currentValue) : value;
      set({ status: newValue.length ? newValue : undefined }, false);
    },
    [set, statusFilter]
  );

  const setPriorityFilter: Dispatch<SetStateAction<string[]>> = useCallback(
    (value) => {
      const currentValue = priorityFilter;
      const newValue =
        typeof value === 'function' ? value(currentValue) : value;
      set({ priority: newValue.length ? newValue : undefined }, false);
    },
    [set, priorityFilter]
  );

  const setHealthFilter: Dispatch<SetStateAction<string[]>> = useCallback(
    (value) => {
      const currentValue = healthFilter;
      const newValue =
        typeof value === 'function' ? value(currentValue) : value;
      set({ health: newValue.length ? newValue : undefined }, false);
    },
    [set, healthFilter]
  );

  // Computed values
  const hasActiveFilters =
    statusFilter.length > 0 ||
    priorityFilter.length > 0 ||
    healthFilter.length > 0;

  const clearFilters = useCallback(() => {
    set(
      {
        status: undefined,
        priority: undefined,
        health: undefined,
        q: undefined, // Clear search query too
      },
      false
    );
  }, [set]);

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
          aVal = new Date(a.created_at ?? 0).getTime();
          bVal = new Date(b.created_at ?? 0).getTime();
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
