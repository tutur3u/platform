'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { User } from '@tuturuuu/types/primitives/User';
import {
  type CursorPosition,
  useCursorTracking,
} from '@tuturuuu/ui/hooks/useCursorTracking';
import { useEffect, useMemo, useState } from 'react';
import type { ListStatusFilter } from './board-header';
import CursorOverlay from './cursor-overlay';
import type { TaskFilters } from './task-filter.types';

export interface CursorViewMetadata {
  listStatusFilter: ListStatusFilter;
  filters: TaskFilters;
}

/**
 * Checks if two cursor metadata objects represent the same view configuration
 */
function isMatchingView(
  metadata1?: CursorViewMetadata,
  metadata2?: CursorViewMetadata
): boolean {
  if (!metadata1 || !metadata2) return true; // Show all cursors if no metadata

  // Check list status filter
  if (metadata1.listStatusFilter !== metadata2.listStatusFilter) return false;

  const f1 = metadata1.filters;
  const f2 = metadata2.filters;

  // Check sort option
  if (f1.sortBy !== f2.sortBy) return false;

  // Check label filters (compare IDs)
  const labels1 = f1.labels.map((l) => l.id).sort();
  const labels2 = f2.labels.map((l) => l.id).sort();
  if (JSON.stringify(labels1) !== JSON.stringify(labels2)) return false;

  // Check assignee filters (compare IDs)
  const assignees1 = f1.assignees.map((a) => a.id).sort();
  const assignees2 = f2.assignees.map((a) => a.id).sort();
  if (JSON.stringify(assignees1) !== JSON.stringify(assignees2)) return false;

  // Check project filters (compare IDs)
  const projects1 = f1.projects.map((p) => p.id).sort();
  const projects2 = f2.projects.map((p) => p.id).sort();
  if (JSON.stringify(projects1) !== JSON.stringify(projects2)) return false;

  // Check priority filters
  const priorities1 = [...f1.priorities].sort();
  const priorities2 = [...f2.priorities].sort();
  if (JSON.stringify(priorities1) !== JSON.stringify(priorities2)) return false;

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

export default function CursorOverlayMultiWrapper({
  channelName,
  containerRef,
  listStatusFilter,
  filters,
}: {
  channelName: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  listStatusFilter?: ListStatusFilter;
  filters?: TaskFilters;
}) {
  const [overlaySize, setOverlaySize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Fetch current user
  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient();

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) return;

        const { data: userData, error: userDataError } = await supabase
          .from('users')
          .select('id, display_name')
          .eq('id', user.id)
          .single();

        if (userDataError) {
          console.warn('Error fetching user data:', userDataError);
          return;
        }

        setCurrentUser(userData);
      } catch (err) {
        console.warn('Error fetching user:', err);
      }
    };

    fetchUser();
  }, []);

  // Create metadata object from view options (only if both are provided)
  const metadata: CursorViewMetadata | undefined = useMemo(() => {
    if (!listStatusFilter || !filters) return undefined;
    return {
      listStatusFilter,
      filters,
    };
  }, [listStatusFilter, filters]);

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
      // Always show cursors without metadata (backward compatibility)
      if (!cursor.metadata) {
        filtered.set(userId, cursor);
        continue;
      }

      // Filter based on view matching
      if (isMatchingView(metadata, cursor.metadata as CursorViewMetadata)) {
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
