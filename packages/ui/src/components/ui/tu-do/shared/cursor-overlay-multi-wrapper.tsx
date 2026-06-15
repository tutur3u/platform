'use client';

import { getCurrentUserProfile } from '@tuturuuu/internal-api';
import type { User } from '@tuturuuu/types/primitives/User';
import {
  type CursorPosition,
  useCursorTracking,
} from '@tuturuuu/ui/hooks/useCursorTracking';
import { useEffect, useMemo, useState } from 'react';
import type { ListStatusFilter } from './board-header';
import CursorOverlay from './cursor-overlay';
import type { BoardFiltersMetadata, TaskFilters } from './task-filter.types';

type CursorScopeMetadata =
  | { type: 'board'; boardId: string }
  | { type: 'task-description'; taskId: string };

type CursorOverlayMetadata = Partial<BoardFiltersMetadata> & {
  cursorScope: CursorScopeMetadata;
};

/**
 * Efficiently compares two sorted arrays of primitive values
 */
function arraysEqual<T extends string | number>(arr1: T[], arr2: T[]): boolean {
  if (arr1.length !== arr2.length) return false;
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }
  return true;
}

/**
 * Checks if two cursor metadata objects represent the same view configuration
 */
function isMatchingFilters(
  metadata1?: CursorOverlayMetadata,
  metadata2?: CursorOverlayMetadata
): boolean {
  if (!metadata1 || !metadata2) return true; // Show all cursors if no metadata
  if (!isMatchingCursorScope(metadata1.cursorScope, metadata2.cursorScope)) {
    return false;
  }

  if (!metadata1.filters || !metadata2.filters) return true;
  if (!metadata1.listStatusFilter || !metadata2.listStatusFilter) return true;

  // Check list status filter
  if (metadata1.listStatusFilter !== metadata2.listStatusFilter) return false;

  const f1 = metadata1.filters;
  const f2 = metadata2.filters;

  // Check sort option
  if (f1.sortBy !== f2.sortBy) return false;

  // Check label filters (compare IDs)
  const labels1 = f1.labels.map((l) => l.id).sort();
  const labels2 = f2.labels.map((l) => l.id).sort();
  if (!arraysEqual(labels1, labels2)) return false;

  // Check assignee filters (compare IDs)
  const assignees1 = f1.assignees.map((a) => a.id).sort();
  const assignees2 = f2.assignees.map((a) => a.id).sort();
  if (!arraysEqual(assignees1, assignees2)) return false;

  // Check project filters (compare IDs)
  const projects1 = f1.projects.map((p) => p.id).sort();
  const projects2 = f2.projects.map((p) => p.id).sort();
  if (!arraysEqual(projects1, projects2)) return false;

  // Check priority filters
  const priorities1 = [...f1.priorities].sort();
  const priorities2 = [...f2.priorities].sort();
  if (!arraysEqual(priorities1, priorities2)) return false;

  // Check due date range
  const date1From = f1.dueDateRange?.from?.getTime();
  const date1To = f1.dueDateRange?.to?.getTime();
  const date2From = f2.dueDateRange?.from?.getTime();
  const date2To = f2.dueDateRange?.to?.getTime();
  if (date1From !== date2From || date1To !== date2To) return false;

  // Check estimation range
  if (
    f1.estimationRange?.min !== f2.estimationRange?.min ||
    f1.estimationRange?.max !== f2.estimationRange?.max
  )
    return false;

  // Check boolean flags
  if (f1.includeUnassigned !== f2.includeUnassigned) return false;

  // Don't compare searchQuery as it's too volatile for cursor filtering
  return true;
}

function isMatchingCursorScope(
  scope1: CursorScopeMetadata,
  scope2: CursorScopeMetadata
) {
  if (scope1.type !== scope2.type) return false;
  if (scope1.type === 'board' && scope2.type === 'board') {
    return scope1.boardId === scope2.boardId;
  }
  if (
    scope1.type === 'task-description' &&
    scope2.type === 'task-description'
  ) {
    return scope1.taskId === scope2.taskId;
  }
  return false;
}

export default function CursorOverlayMultiWrapper({
  channelName,
  containerRef,
  cursorScope,
  listStatusFilter,
  filters,
}: {
  channelName: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  cursorScope: CursorScopeMetadata;
  listStatusFilter?: ListStatusFilter;
  filters?: TaskFilters;
}) {
  const [overlaySize, setOverlaySize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const cursorScopeType = cursorScope.type;
  const cursorScopeId =
    cursorScope.type === 'board' ? cursorScope.boardId : cursorScope.taskId;

  // Fetch current user
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await getCurrentUserProfile();
        if (!userData?.id) return;
        setCurrentUser({
          avatar_url: userData.avatar_url,
          display_name: userData.display_name,
          id: userData.id,
        });
      } catch (err) {
        console.warn('Error fetching user:', err);
      }
    };

    fetchUser();
  }, []);

  const metadata: CursorOverlayMetadata = useMemo(() => {
    const resolvedCursorScope =
      cursorScopeType === 'board'
        ? ({ boardId: cursorScopeId, type: 'board' } as const)
        : ({ taskId: cursorScopeId, type: 'task-description' } as const);

    if (!listStatusFilter || !filters) {
      return { cursorScope: resolvedCursorScope };
    }

    return {
      cursorScope: resolvedCursorScope,
      listStatusFilter,
      filters,
    };
  }, [cursorScopeId, cursorScopeType, listStatusFilter, filters]);

  const { cursors, error } = useCursorTracking(
    channelName,
    containerRef,
    currentUser ?? undefined,
    metadata
  );

  // Filter cursors based on matching view metadata
  const filteredCursors = useMemo(() => {
    const filtered = new Map<string, CursorPosition>();

    for (const [userId, cursor] of cursors.entries()) {
      if (!cursor.metadata) {
        continue;
      }

      // Filter based on view matching
      if (
        isMatchingFilters(metadata, cursor.metadata as CursorOverlayMetadata)
      ) {
        filtered.set(userId, cursor);
      }
    }

    return filtered;
  }, [cursors, metadata]);

  useEffect(() => {
    if (!containerRef.current) return;

    try {
      const updateOverlaySize = () => {
        try {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            setOverlaySize({ width: rect.width, height: rect.height });
          }
        } catch (err) {
          // Silently fail on resize errors
          console.warn('Cursor overlay resize error:', err);
        }
      };

      // Initial update
      updateOverlaySize();

      // Update on resize
      const resizeObserver = new ResizeObserver(updateOverlaySize);
      resizeObserver.observe(containerRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    } catch (err) {
      // Catch any setup errors
      console.warn('Cursor overlay setup error:', err);
      return;
    }
  }, [containerRef]);

  // Don't render if errors detected or user not fetched yet
  if (error || !currentUser) {
    return null;
  }

  return (
    <CursorOverlay
      cursors={filteredCursors}
      width={overlaySize.width}
      height={overlaySize.height}
    />
  );
}
