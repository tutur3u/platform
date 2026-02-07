import { useEffect, useState } from 'react';

/**
 * Static function to check if the page is currently visible.
 * Use this in non-React contexts (e.g., class-based SupabaseProvider).
 */
export function isPageVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

/**
 * React hook that tracks page visibility state.
 * Returns `true` when the tab is active/visible, `false` when hidden.
 * Used to pause expensive broadcasts (cursors, resyncs) in background tabs.
 */
export function usePageVisibility(): boolean {
  const [visible, setVisible] = useState(() => isPageVisible());

  useEffect(() => {
    const handleChange = () => setVisible(isPageVisible());
    document.addEventListener('visibilitychange', handleChange);
    return () => document.removeEventListener('visibilitychange', handleChange);
  }, []);

  return visible;
}
