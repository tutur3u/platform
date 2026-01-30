import { useCallback, useMemo } from 'react';
import { useLocalStorage } from './use-local-storage';

export type ChartPeriod = 'week' | 'month' | 'quarter' | 'year';

export interface InterestDisplayPreferences {
  showChart: boolean;
  chartPeriod: ChartPeriod;
  showProjections: boolean;
  showTransparency: boolean;
  expandByDefault: boolean;
}

const DEFAULT_PREFERENCES: InterestDisplayPreferences = {
  showChart: true,
  chartPeriod: 'month',
  showProjections: true,
  showTransparency: false,
  expandByDefault: false,
};

/**
 * Hook for managing interest display preferences.
 * Uses localStorage for persistence, keyed by wallet ID.
 */
export function useInterestPreferences(walletId: string) {
  const storageKey = `interest-prefs-${walletId}`;

  const [storedPrefs, setStoredPrefs] = useLocalStorage<
    Partial<InterestDisplayPreferences>
  >(storageKey, {});

  // Merge stored preferences with defaults
  const preferences = useMemo<InterestDisplayPreferences>(
    () => ({
      ...DEFAULT_PREFERENCES,
      ...storedPrefs,
    }),
    [storedPrefs]
  );

  // Update a single preference
  const updatePreference = useCallback(
    <K extends keyof InterestDisplayPreferences>(
      key: K,
      value: InterestDisplayPreferences[K]
    ) => {
      setStoredPrefs((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    [setStoredPrefs]
  );

  // Reset all preferences to defaults
  const resetPreferences = useCallback(() => {
    setStoredPrefs({});
  }, [setStoredPrefs]);

  return {
    preferences,
    updatePreference,
    resetPreferences,
  };
}

/**
 * Hook for global interest display defaults.
 * Used in settings dialog for configuring defaults across all wallets.
 */
export function useGlobalInterestPreferences() {
  const storageKey = 'interest-prefs-global';

  const [storedPrefs, setStoredPrefs] = useLocalStorage<
    Partial<InterestDisplayPreferences>
  >(storageKey, {});

  const preferences = useMemo<InterestDisplayPreferences>(
    () => ({
      ...DEFAULT_PREFERENCES,
      ...storedPrefs,
    }),
    [storedPrefs]
  );

  const updatePreference = useCallback(
    <K extends keyof InterestDisplayPreferences>(
      key: K,
      value: InterestDisplayPreferences[K]
    ) => {
      setStoredPrefs((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    [setStoredPrefs]
  );

  return {
    preferences,
    updatePreference,
  };
}
