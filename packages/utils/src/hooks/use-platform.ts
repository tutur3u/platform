'use client';

import { useSyncExternalStore } from 'react';

/**
 * Detect if the current platform is Mac
 * This runs synchronously to avoid hydration mismatch
 */
function getIsMac(): boolean {
  if (typeof window === 'undefined') return false;

  // Modern API: navigator.userAgentData (Chromium-based browsers)
  if ('userAgentData' in navigator && navigator.userAgentData) {
    const platform = (navigator.userAgentData as { platform?: string })
      .platform;
    return platform?.toLowerCase().includes('mac') ?? false;
  }

  // Fallback: navigator.platform (deprecated but widely supported)
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

// Cache the result since it won't change during session
let cachedIsMac: boolean | null = null;

function subscribe() {
  // Platform doesn't change, so no-op
  return () => {};
}

function getSnapshot(): boolean {
  if (cachedIsMac === null) {
    cachedIsMac = getIsMac();
  }
  return cachedIsMac;
}

function getServerSnapshot(): boolean {
  // On server, default to false (non-Mac)
  // The client will hydrate with the correct value
  return false;
}

/**
 * Hook to detect the user's platform (Mac vs non-Mac)
 * Uses useSyncExternalStore for proper SSR/hydration handling
 */
export function usePlatform() {
  const isMac = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    isMac,
    modKey: isMac ? '⌘' : 'Ctrl',
    modKeyAlt: isMac ? '⌥' : 'Alt',
  };
}

/**
 * Get platform-aware modifier key for SSR-safe contexts
 * Returns a default and should be used with the hook for client-side rendering
 */
export function getModifierKeyLabel(isMac: boolean) {
  return isMac ? '⌘' : 'Ctrl';
}
