// Static fixtures that replace the calendar data, auth and network modules
// for the layout-shift harness. The harness script maps each replaced module
// to this file by its resolved path, so relative and package imports both land
// here. No production data is used.
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

/** How long the fixture "fetch" keeps the events loading after mount. */
const FIXTURE_LOAD_MS = 400;

// use-calendar
const calendarFixture = {
  getEvent: () => undefined,
  getCurrentEvents: () => [],
  getUpcomingEvent: () => undefined,
  getEvents: () => [],
  getGoogleEvents: () => [],
  getEventLevel: () => 0,
  addEvent: async () => undefined,
  addEmptyEvent: () => ({}),
  addEmptyEventWithDuration: () => ({}),
  updateEvent: async () => undefined,
  deleteEvent: async () => undefined,
  isModalOpen: false,
  activeEvent: undefined,
  isPreviewOpen: false,
  previewEvent: undefined,
  openModal: () => undefined,
  openEventEditor: () => undefined,
  closePreview: () => undefined,
  closeModal: () => undefined,
  isEditing: () => false,
  hideModal: () => undefined,
  showModal: () => undefined,
  getModalStatus: () => false,
  getActiveEvent: () => undefined,
  isModalActive: () => false,
  syncGoogleCalendarNow: async () => false,
  isDragging: false,
  setIsDragging: () => undefined,
  hoveredBaseEventId: null,
  setHoveredBaseEventId: () => undefined,
  hoveredEventColumn: null,
  setHoveredEventColumn: () => undefined,
  setOnTaskScheduled: () => undefined,
  previewEvents: [],
  setPreviewEvents: () => undefined,
  clearPreviewEvents: () => undefined,
  affectedEventIds: new Set<string>(),
  setAffectedEventIds: () => undefined,
  clearAffectedEventIds: () => undefined,
  hideNonPreviewEvents: false,
  setHideNonPreviewEvents: () => undefined,
  defaultNewEventTab: 'manual' as const,
  disableBuiltInEventUi: false,
  preservePastEventOpacity: false,
  isEventReadOnly: () => false,
  readOnly: false,
};
export function useCalendar() {
  return calendarFixture;
}
export function CalendarProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// use-calendar-sync: dates are real state; events load once after mount.
type SyncFixture = {
  dates: Date[];
  setDates: (dates: Date[]) => void;
  timezone: string | undefined;
  setTimezone: (timezone: string | undefined) => void;
  isLoading: boolean;
  isSyncing: boolean;
  events: never[];
  eventsWithoutAllDays: never[];
  allDayEvents: never[];
  calendarConnections: never[];
  enabledCalendarIds: Set<string>;
  syncStatus: { state: 'idle' };
  refresh: () => void;
  patchVisibleEvents: () => void;
};
const SyncContext = createContext<SyncFixture | null>(null);
export function CalendarSyncProvider({ children }: { children: ReactNode }) {
  const [dates, setDates] = useState<Date[]>([]);
  const [timezone, setTimezone] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setIsLoading(false), FIXTURE_LOAD_MS);
    return () => window.clearTimeout(id);
  }, []);
  const value = useMemo<SyncFixture>(
    () => ({
      dates,
      setDates,
      timezone,
      setTimezone,
      isLoading,
      isSyncing: false,
      events: [],
      eventsWithoutAllDays: [],
      allDayEvents: [],
      calendarConnections: [],
      enabledCalendarIds: new Set(),
      syncStatus: { state: 'idle' },
      refresh: () => undefined,
      patchVisibleEvents: () => undefined,
    }),
    [dates, timezone, isLoading]
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
export function useCalendarSync() {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useCalendarSync fixture needs its provider');
  return value;
}

// use-workspace-visibility
export function useWorkspaceActor() {
  return { actorId: 'fixture-user' };
}
export function useWorkspaceVisibility() {
  return { isLoading: false, visibility: null };
}
export function WorkspaceVisibilityProvider({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}

// Dialogs behind the "+ New" menu stay closed in this harness.
export function NativeRecurrenceDialog() {
  return null;
}
export function QuickTaskDialog() {
  return null;
}
export function SmartSchedulePreviewPanel() {
  return null;
}
export function EventModal() {
  return null;
}
export function EventPreviewPopover() {
  return null;
}
export default function HabitFormDialog() {
  return null;
}
