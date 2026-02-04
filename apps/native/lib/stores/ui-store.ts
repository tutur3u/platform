import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '../supabase/secure-storage';

type ThemeMode = 'light' | 'dark' | 'system';

type UIState = {
  // Theme
  themeMode: ThemeMode;

  // Modals
  isSettingsModalOpen: boolean;

  // Onboarding
  hasCompletedOnboarding: boolean;

  // Calendar view preference
  calendarView: 'agenda' | 'day' | '3day' | 'week' | 'month';

  // Task list preference
  taskViewMode: 'list' | 'grouped';
};

type UIActions = {
  // Theme
  setThemeMode: (mode: ThemeMode) => void;

  // Modals
  openSettingsModal: () => void;
  closeSettingsModal: () => void;

  // Onboarding
  completeOnboarding: () => void;
  resetOnboarding: () => void;

  // Calendar
  setCalendarView: (view: UIState['calendarView']) => void;

  // Tasks
  setTaskViewMode: (mode: UIState['taskViewMode']) => void;

  // Reset
  resetUIState: () => void;
};

export type UIStore = UIState & UIActions;

const initialState: UIState = {
  themeMode: 'system',
  isSettingsModalOpen: false,
  hasCompletedOnboarding: false,
  calendarView: 'week',
  taskViewMode: 'list',
};

/**
 * UI store for managing app-wide UI state
 *
 * Persists user preferences like theme mode and view settings.
 *
 * @example
 * ```typescript
 * import { useUIStore } from '@/lib/stores/ui-store';
 *
 * function ThemeToggle() {
 *   const { themeMode, setThemeMode } = useUIStore();
 *
 *   return (
 *     <SegmentedControl
 *       values={['light', 'dark', 'system']}
 *       selectedIndex={['light', 'dark', 'system'].indexOf(themeMode)}
 *       onChange={(event) => setThemeMode(event.nativeEvent.value)}
 *     />
 *   );
 * }
 * ```
 */
export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      ...initialState,

      // Theme actions
      setThemeMode: (mode) => set({ themeMode: mode }),

      // Modal actions
      openSettingsModal: () => set({ isSettingsModalOpen: true }),
      closeSettingsModal: () => set({ isSettingsModalOpen: false }),

      // Onboarding actions
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      resetOnboarding: () => set({ hasCompletedOnboarding: false }),

      // Calendar actions
      setCalendarView: (view) => set({ calendarView: view }),

      // Task actions
      setTaskViewMode: (mode) => set({ taskViewMode: mode }),

      // Reset
      resetUIState: () => set(initialState),
    }),
    {
      name: STORAGE_KEYS.USER_PREFERENCES,
      storage: createJSONStorage(() => AsyncStorage),
      // Persist only preferences, not transient modal state
      partialize: (state) => ({
        themeMode: state.themeMode,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        calendarView: state.calendarView,
        taskViewMode: state.taskViewMode,
      }),
    }
  )
);

/**
 * Selector hooks for common UI state
 */
export const useThemeMode = () => useUIStore((state) => state.themeMode);
export const useCalendarView = () => useUIStore((state) => state.calendarView);
export const useTaskViewMode = () => useUIStore((state) => state.taskViewMode);
export const useHasCompletedOnboarding = () =>
  useUIStore((state) => state.hasCompletedOnboarding);
