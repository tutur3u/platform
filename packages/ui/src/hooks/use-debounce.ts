import { useDebouncedValue } from '@tanstack/react-pacer/debouncer';

/**
 * Hook that returns a debounced value.
 *
 * @param value - The value to debounce
 * @param delay - The delay in milliseconds
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number) {
  return useDebouncedValue(value, { wait: delay });
}
