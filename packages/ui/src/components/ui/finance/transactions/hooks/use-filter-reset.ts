import { useCallback } from 'react';

/**
 * Shared hook for filter wrappers that resets page to 1 when filter values change.
 *
 * @param setFilterValue - The setter function for the filter query state
 * @param setPage - The setter function for the page query state
 * @returns A callback that updates the filter and resets page to 1
 */
export function useFilterReset<T>(
  setFilterValue: (value: T | null) => void,
  setPage: (value: number) => void
) {
  return useCallback(
    (newValue: T) => {
      // Clear with null if empty array, otherwise set the value directly
      const valueToSet =
        Array.isArray(newValue) && newValue.length === 0 ? null : newValue;

      setFilterValue(valueToSet as T | null);
      setPage(1); // Reset to first page when filtering
    },
    [setFilterValue, setPage]
  );
}
