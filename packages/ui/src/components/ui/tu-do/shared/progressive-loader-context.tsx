'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import { createContext, useContext } from 'react';

export interface ListPaginationState {
  page: number;
  hasMore: boolean;
  totalCount: number;
  isLoading: boolean;
  isInitialLoad: boolean;
}

export interface ProgressiveLoaderValue {
  loadListPage: (
    listId: string,
    page?: number
  ) => Promise<{ tasks: Task[]; totalCount: number; hasMore: boolean }>;
  pagination: Record<string, ListPaginationState>;
}

const ProgressiveLoaderContext = createContext<ProgressiveLoaderValue | null>(
  null
);

export const ProgressiveLoaderProvider = ProgressiveLoaderContext.Provider;

export function useProgressiveLoader(): ProgressiveLoaderValue {
  const ctx = useContext(ProgressiveLoaderContext);
  if (!ctx) {
    throw new Error(
      'useProgressiveLoader must be used within a ProgressiveLoaderProvider'
    );
  }
  return ctx;
}
