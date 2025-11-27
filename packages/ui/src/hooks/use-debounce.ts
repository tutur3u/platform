import { useDebouncedValue } from '@tanstack/react-pacer/debouncer';

/**
 * Hook that returns a debounced value.
 *
 * @param value - The value to debounce
 * @param delay - The delay in milliseconds
 * @returns A tuple [debouncedValue, debouncer] - destructure to access the debounced value and the debouncer instance
 */
export function useDebounce<T>(
  value: T,
  delay: number
): ReturnType<typeof useDebouncedValue<T, unknown>> {
  return useDebouncedValue(value, { wait: delay });
}
