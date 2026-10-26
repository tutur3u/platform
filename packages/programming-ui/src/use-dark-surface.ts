'use client';
import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  if (typeof document === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style'],
  });
  return () => observer.disconnect();
}
function snapshot() {
  return (
    typeof document !== 'undefined' &&
    (document.documentElement.classList.contains('dark') ||
      document.documentElement.style.colorScheme === 'dark')
  );
}
/** Follows the app theme class so the code editor never renders a light sheet inside a dark room. */
export function useDarkSurface() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
