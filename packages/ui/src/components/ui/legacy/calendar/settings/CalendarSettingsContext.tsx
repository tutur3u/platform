'use client';

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';

// Defines the data type for the time setting of each category
export interface CategoryTimeSetting {
  startHour: number;
  endHour: number;
  optimalHours: number[];
  preferredDays: string[];
}

// Defines the data type for all time settings
export interface CategoryTimeSettings {
  [category: string]: CategoryTimeSetting;
}

// Settings for Smart Scheduling
export interface SmartSchedulingSettings {
  enabled: boolean;
  avoidOverlaps: boolean;
  respectBlockedTime: boolean;
  defaultTaskDuration: number; // in minutes
  focusTimePreferences: {
    morning: boolean;
    afternoon: boolean;
    evening: boolean;
  };
  respectWorkingHours: boolean;
  workingHours: {
    start: number; // hour of day (0-23)
    end: number; // hour of day (0-23)
  };
  maxTasksPerDay: number;
  categoryTimeSettings?: CategoryTimeSettings;
}

// Task settings
export interface TaskSettings {
  defaultTaskDuration: number; // in minutes
}

// Calendar appearance settings
export interface AppearanceSettings {
  firstDayOfWeek: 'monday' | 'sunday' | 'saturday';
  timeFormat: '12h' | '24h';
  defaultView: 'day' | '4-days' | 'week' | 'month';
  showWeekends: boolean;
  compactView: boolean;
  showEventTime: boolean;
  showCurrentTime: boolean;
  highlightCurrentDay: boolean;
}

// Category color mapping settings
export interface CategoryColorSettings {
  categories: Array<{
    name: string;
    color: SupportedColor;
  }>;
}

// Calendar settings interface
export interface CalendarSettings {
  appearance: AppearanceSettings;
  categoryColors: CategoryColorSettings;
  smartScheduling: SmartSchedulingSettings;
  taskSettings: TaskSettings;
}

// Default calendar settings
export const defaultCalendarSettings: CalendarSettings = {
  appearance: {
    firstDayOfWeek: 'monday',
    timeFormat: '12h',
    defaultView: 'week',
    showWeekends: true,
    compactView: false,
    showEventTime: true,
    showCurrentTime: true,
    highlightCurrentDay: true,
  },
  categoryColors: {
    categories: [
      { name: 'Work', color: 'BLUE' },
      { name: 'Meeting', color: 'CYAN' },
      { name: 'Personal', color: 'GREEN' },
    ],
  },
  smartScheduling: {
    enabled: true,
    avoidOverlaps: true,
    respectBlockedTime: true,
    defaultTaskDuration: 60, // Default to 1 hour
    focusTimePreferences: {
      morning: true,
      afternoon: false,
      evening: false,
    },
    respectWorkingHours: true,
    workingHours: {
      start: 9, // 9 AM
      end: 17, // 5 PM
    },
    maxTasksPerDay: 5,
    categoryTimeSettings: {
      Work: {
        startHour: 9,
        endHour: 17,
        optimalHours: [9, 10, 11, 14, 15, 16],
        preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      },
      Meeting: {
        startHour: 10,
        endHour: 16,
        optimalHours: [10, 11, 14, 15],
        preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      },
      Personal: {
        startHour: 7,
        endHour: 22,
        optimalHours: [7, 8, 12, 13, 17, 18, 19, 20],
        preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      }
    }
  },
  taskSettings: {
    defaultTaskDuration: 60, // Default to 1 hour
  },
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
      return JSON.parse(storedSettings) as Partial<CalendarSettings>;
    }
  } catch (error) {
    console.error('Failed to load settings from localStorage:', error);
  }
  return null;
};

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

  const [settings, setSettings] = useState<CalendarSettings>({
    ...defaultCalendarSettings,
    ...(storedSettings || {}),
    ...initialSettings,
  });

  const [originalSettings, setOriginalSettings] = useState<CalendarSettings>({
    ...defaultCalendarSettings,
    ...(storedSettings || {}),
    ...initialSettings,
  });

  const [hasChanges, setHasChanges] = useState(false);

  // Update hasChanges when settings change
  useEffect(() => {
    const settingsChanged =
      JSON.stringify(settings) !== JSON.stringify(originalSettings);
    setHasChanges(settingsChanged);
  }, [settings, originalSettings]);

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
