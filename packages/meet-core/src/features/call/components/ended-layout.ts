'use client';
import { useSyncExternalStore } from 'react';

const WIDE = '(min-width: 1024px)';

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const wide = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.(WIDE).matches;

/**
 * Whether the ended page has room for the notes beside the summary. The
 * server and the first client render assume a phone, so hydration never
 * mismatches; wide screens move the reader into its column right after.
 */
export function useWideEndedLayout() {
  return useSyncExternalStore(subscribe, wide, () => false);
}
