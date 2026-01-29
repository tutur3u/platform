/**
 * Sort key helper functions for kanban board
 * Handles sort key calculation with automatic retry on gap exhaustion
 */

import type { SupabaseClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { toast } from '@tuturuuu/ui/sonner';
import {
  calculateSortKey,
  normalizeListSortKeys,
  SortKeyGapExhaustedError,
} from '@tuturuuu/utils/task-helper';

/**
 * Calculate sort key with automatic retry on gap exhaustion or inverted keys
 * If SortKeyGapExhaustedError is thrown (including for inverted keys), normalizes the list and retries once
 *
 * @param supabase - Supabase client for database operations
 * @param prevSortKey - Sort key of the previous task (null if inserting at beginning)
 * @param nextSortKey - Sort key of the next task (null if inserting at end)
 * @param listId - ID of the list where the task is being inserted
 * @param visualOrderTasks - Optional array of tasks in their current visual order (respects filters/sorting)
 * @returns Promise resolving to the calculated sort key
 * @throws Error if calculation fails even after normalization
 */
export async function calculateSortKeyWithRetry(
  supabase: SupabaseClient,
  prevSortKey: number | null | undefined,
  nextSortKey: number | null | undefined,
  listId: string,
  visualOrderTasks?: Pick<Task, 'id' | 'sort_key' | 'created_at'>[]
): Promise<number> {
  try {
    return calculateSortKey(prevSortKey, nextSortKey);
  } catch (error) {
    if (error instanceof SortKeyGapExhaustedError) {
      console.warn(
        '⚠️ Sort key gap exhausted or inverted keys detected, normalizing list and retrying...',
        {
          listId,
          prevSortKey,
          nextSortKey,
          error: error.message,
        }
      );

      try {
        // Normalize the list sort keys to match visual order
        // If visual order is provided, use it; otherwise normalize by database order
        await normalizeListSortKeys(supabase, listId, visualOrderTasks);
        console.log('✅ List sort keys normalized, refetching...');

        // After normalization, we can't reuse the old prev/next values
        // Show a toast asking user to retry
        toast.info(
          'Task order has been normalized. Please try the drag operation again.',
          { duration: 3000 }
        );

        // Return a safe default to avoid crashes
        // The next drag operation will use properly normalized keys
        return calculateSortKey(prevSortKey, null);
      } catch (retryError) {
        console.error(
          '❌ Failed to calculate sort key after normalization:',
          retryError
        );
        toast.error(
          'Failed to reorder task. Please try again or refresh the page.'
        );
        throw retryError;
      }
    }
    // Re-throw non-SortKeyGapExhaustedError errors
    throw error;
  }
}
