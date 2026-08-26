'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Tailwind's `xl`. Three panes need roughly this much width before the centre
 * column stops being unusably narrow.
 */
const WIDE_BREAKPOINT = 1280;

const STORAGE_KEY = 'tuturuuu:form-studio:build-layout';

export type StudioBuildLayoutMode = 'stacked' | 'three-pane';

/**
 * Which build layout to render, and the setter behind the toggle.
 *
 * `stacked` is the default on purpose. The three-pane layout does not yet
 * cover reordering from the outline or editing a section's own fields, so
 * making it the default would take those away from anyone on a wide screen.
 * It is opt-in until it is a superset rather than an alternative.
 *
 * The preference is per-browser, and a narrow viewport always wins: three
 * panes in 600px is not a layout, it is three unusable columns.
 */
export function useStudioBuildLayout() {
  const [preference, setPreference] =
    useState<StudioBuildLayoutMode>('stacked');
  const [isWide, setIsWide] = useState(true);

  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${WIDE_BREAKPOINT}px)`);
    const sync = () => setIsWide(query.matches);

    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    // Private windows and blocked site data make this throw rather than
    // return null, so the read cannot be left bare.
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'three-pane') {
        setPreference('three-pane');
      }
    } catch {
      // Keep the default.
    }
  }, []);

  const setLayout = useCallback((next: StudioBuildLayoutMode) => {
    setPreference(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The preference still applies for this session.
    }
  }, []);

  return {
    layout: isWide ? preference : 'stacked',
    preference,
    canUseThreePane: isWide,
    setLayout,
  };
}
