/**
 * Sort key helper functions for kanban board
 * Handles sort key calculation with automatic retry on gap exhaustion
 */

import type { SupabaseClient } from '@tuturuuu/supabase/next/client';
import { toast } from '@tuturuuu/ui/sonner';
import {
  calculateSortKey,
  normalizeListSortKeys,
  SortKeyGapExhaustedError,
} from '@tuturuuu/utils/task-helper';

/**
 * Calculate sort key with automatic retry on gap exhaustion
 * If SortKeyGapExhaustedError is thrown, normalizes the list and retries once
 *
 * @param supabase - Supabase client for database operations
 * @param prevSortKey - Sort key of the previous task (null if inserting at beginning)
 * @param nextSortKey - Sort key of the next task (null if inserting at end)
 * @param listId - ID of the list where the task is being inserted
 * @returns Promise resolving to the calculated sort key
 * @throws Error if calculation fails even after normalization
 */
export async function calculateSortKeyWithRetry(
  supabase: SupabaseClient,
  prevSortKey: number | null | undefined,
  nextSortKey: number | null | undefined,
  listId: string
): Promise<number> {
  try {
    return calculateSortKey(prevSortKey, nextSortKey);
  } catch (error) {
    if (error instanceof SortKeyGapExhaustedError) {
      console.warn(
        '⚠️ Sort key gap exhausted, normalizing list and retrying...',
        {
          listId,
          prevSortKey,
          nextSortKey,
          error: error.message,
        }
      );

      try {
        // Normalize the list sort keys
        await normalizeListSortKeys(supabase, listId);
        console.log('✅ List sort keys normalized, retrying calculation...');

        // Retry the calculation after normalization
        return calculateSortKey(prevSortKey, nextSortKey);
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
