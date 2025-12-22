import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  type AppearanceData,
  defaultAppearanceData,
} from './appearance-settings';
// categoryColors is now managed independently via TanStack Query
// in use-calendar-categories.ts hook
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
  smartScheduling: {
    ...defaultSmartSchedulingData,
    minBuffer: 5,
    preferredBuffer: 15,
    energyProfile: 'morning_person',
  },
  taskSettings: defaultTaskSettings,
};

// Database-only storage - no localStorage
// Settings are initialized from user and workspace database records
// and persisted via API endpoints

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
  wsId?: string;
}) {
  // Initialize from database only - no localStorage
  const [settings, setSettings] = useState<CalendarSettings>({
    ...defaultCalendarSettings,
    ...initialSettings,
  });

  const [originalSettings, setOriginalSettings] = useState<CalendarSettings>({
    ...defaultCalendarSettings,
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
    // No localStorage - database only
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
