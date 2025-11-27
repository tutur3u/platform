'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  type AppearanceData,
  defaultAppearanceData,
} from './appearance-settings';
import {
  type CategoryColorsData,
  defaultCategoryColors,
} from './category-color-settings';
import {
  defaultNotificationData,
  type NotificationData,
} from './notification-settings';
import {
  defaultSmartSchedulingData,
  type SmartSchedulingData,
} from './smart-scheduling-settings';
import { defaultTaskSettings, type TaskSettingsData } from './task-settings';
import {
  defaultWeekTimeRanges,
  type WeekTimeRanges,
} from './time-range-picker';
import { defaultTimezoneData, type TimezoneData } from './timezone-settings';

export type CalendarSettings = {
  firstDayOfWeek: number;
  showWeekends: boolean;
  showWeekNumbers: boolean;
  use24HourFormat: boolean;
  defaultView: 'day' | 'week' | '4day';
  categoryColors: CategoryColorsData;
  personalHours: WeekTimeRanges;
  workHours: WeekTimeRanges;
  meetingHours: WeekTimeRanges;
  timezone: TimezoneData;
  appearance: AppearanceData;
  notifications: NotificationData;
  smartScheduling: SmartSchedulingData;
  taskSettings: TaskSettingsData;
};

export const defaultCalendarSettings: CalendarSettings = {
  firstDayOfWeek: 1, // Monday
  showWeekends: true,
  showWeekNumbers: false,
  use24HourFormat: false,
  defaultView: 'week',
  personalHours: defaultWeekTimeRanges,
  meetingHours: defaultWeekTimeRanges,
  workHours: defaultWeekTimeRanges,
  timezone: defaultTimezoneData,
  appearance: defaultAppearanceData,
  notifications: defaultNotificationData,
  categoryColors: defaultCategoryColors,
  smartScheduling: defaultSmartSchedulingData,
  taskSettings: defaultTaskSettings,
};

// Helper function to load settings from localStorage
const loadSettingsFromStorage = (): Partial<CalendarSettings> | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedSettings = localStorage.getItem('calendarSettings');
    if (storedSettings) {
      console.log('Loading settings from localStorage');
      const parsed = JSON.parse(storedSettings);
      return isValidPartialCalendarSettings(parsed) ? parsed : null;
    }
  } catch (error) {
    console.error('Failed to load settings from localStorage:', error);
  }
  return null;
};

// Type guard for Partial<CalendarSettings>
function isValidPartialCalendarSettings(
  obj: any
): obj is Partial<CalendarSettings> {
  if (!obj || typeof obj !== 'object') return false;
  // Only check a few critical keys for safety
  if ('personalHours' in obj && typeof obj.personalHours !== 'object')
    return false;
  if ('workHours' in obj && typeof obj.workHours !== 'object') return false;
  if ('meetingHours' in obj && typeof obj.meetingHours !== 'object')
    return false;
  if ('appearance' in obj && typeof obj.appearance !== 'object') return false;
  if ('notifications' in obj && typeof obj.notifications !== 'object')
    return false;
  return true;
}

// Deep merge settings to properly handle nested objects like appearance, timezone, etc.
function deepMergeSettings(
  defaults: CalendarSettings,
  ...overrides: (Partial<CalendarSettings> | null | undefined)[]
): CalendarSettings {
  // Use Record type to allow dynamic key assignment
  const result: Record<string, unknown> = { ...defaults };

  for (const override of overrides) {
    if (!override) continue;

    for (const key of Object.keys(override)) {
      const value = (override as Record<string, unknown>)[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Deep merge nested objects (appearance, timezone, notifications, etc.)
        result[key] = { ...(result[key] as object), ...value };
      } else if (value !== undefined) {
        result[key] = value;
      }
    }
  }

  return result as CalendarSettings;
}

type CalendarSettingsContextType = {
  settings: CalendarSettings;
  updateSettings: <K extends keyof CalendarSettings>(
    section: K,
    value: CalendarSettings[K]
  ) => void;
  saveSettings: () => Promise<void>;
  resetSettings: () => void;
  hasChanges: boolean;
};

const CalendarSettingsContext = createContext<
  CalendarSettingsContextType | undefined
>(undefined);

export function CalendarSettingsProvider({
  children,
  initialSettings,
  onSave,
}: {
  children: ReactNode;
  initialSettings?: Partial<CalendarSettings>;
  onSave?: (settings: CalendarSettings) => Promise<void>;
}) {
  const storedSettings = loadSettingsFromStorage();

  // Use deep merge to properly combine nested objects like appearance, timezone, etc.
  const [settings, setSettings] = useState<CalendarSettings>(() =>
    deepMergeSettings(defaultCalendarSettings, storedSettings, initialSettings)
  );

  const [originalSettings, setOriginalSettings] = useState<CalendarSettings>(
    () =>
      deepMergeSettings(
        defaultCalendarSettings,
        storedSettings,
        initialSettings
      )
  );

  const [hasChanges, setHasChanges] = useState(false);

  // Sync settings when initialSettings prop changes (e.g., when workspace data loads)
  // Sync settings when initialSettings prop changes (e.g., when workspace data loads)
  const prevInitialSettingsRef = useRef<string>('');

  useEffect(() => {
    if (initialSettings) {
      const initialSettingsStr = JSON.stringify(initialSettings);
      if (initialSettingsStr !== prevInitialSettingsRef.current) {
        prevInitialSettingsRef.current = initialSettingsStr;

        setSettings((prev) =>
          deepMergeSettings(defaultCalendarSettings, prev, initialSettings)
        );
        setOriginalSettings((prev) =>
          deepMergeSettings(defaultCalendarSettings, prev, initialSettings)
        );
      }
    }
  }, [initialSettings]);

  // Update hasChanges when settings change
  // Update hasChanges when settings change
  useEffect(() => {
    const settingsChanged =
      JSON.stringify(settings) !== JSON.stringify(originalSettings);
    if (hasChanges !== settingsChanged) {
      setHasChanges(settingsChanged);
    }
  }, [settings, originalSettings, hasChanges]);

  const updateSettings = <K extends keyof CalendarSettings>(
    section: K,
    value: CalendarSettings[K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      [section]: value,
    }));
  };

  const saveSettings = async () => {
    // Save to localStorage
    try {
      localStorage.setItem('calendarSettings', JSON.stringify(settings));
      console.log('Settings saved to localStorage from dialog');
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }

    // Call the parent's onSave if provided
    if (onSave) {
      await onSave(settings);
    }

    setOriginalSettings({ ...settings });
    setHasChanges(false);
  };

  const resetSettings = () => {
    setSettings({ ...originalSettings });
    setHasChanges(false);
  };

  return (
    <CalendarSettingsContext.Provider
      value={{
        settings,
        updateSettings,
        saveSettings,
        resetSettings,
        hasChanges,
      }}
    >
      {children}
    </CalendarSettingsContext.Provider>
  );
}

export function useCalendarSettings() {
  const context = useContext(CalendarSettingsContext);
  if (context === undefined) {
    throw new Error(
      'useCalendarSettings must be used within a CalendarSettingsProvider'
    );
  }
  return context;
}
