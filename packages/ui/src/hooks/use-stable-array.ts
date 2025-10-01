import { useRef } from 'react';

/**
 * Returns a stable array reference that only updates when content changes.
 * Prevents unnecessary re-renders from array recreation with same values.
 *
 * @param array - The input array to stabilize
 * @returns Stable array reference
 */
export function useStableArray<T>(array: T[]): T[] {
  const arrayRef = useRef<T[]>(array);
  const prevArrayRef = useRef<T[]>(array);

  if (
    array.length !== prevArrayRef.current.length ||
    array.some((item, index) => item !== prevArrayRef.current[index])
  ) {
    arrayRef.current = array;
    prevArrayRef.current = array;
  }

  return arrayRef.current;
}
