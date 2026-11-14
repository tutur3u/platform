/**
 * View model for the Meetings home. It mirrors the meeting schedule read
 * contract (`MeetingSchedule`): a schedule read model assigns to
 * `MeetingsHomeSchedule` without conversion.
 */

/** UTC ISO 8601 instant; presentation uses the viewer's timezone. */
export type UtcInstant = string;

export type ViewerTimezone =
  | { source: 'user-profile'; timeZone: string }
  | { source: 'browser'; timeZone: null };

export interface MeetingCalendarEvent {
  id: string;
  startAt: UtcInstant;
  endAt: UtcInstant;
}

export interface ScheduledMeeting {
  id: string;
  name: string;
  /** Null for legacy timestamps without an explicit UTC offset. */
  time: UtcInstant | null;
  createdAt: UtcInstant;
  creatorId: string;
  calendar: MeetingCalendarEvent | null;
}

export type CalendarAccess =
  | { status: 'available' }
  | { status: 'forbidden' }
  | { status: 'unavailable' };

export type PastCollapseChoice = 'collapsed' | 'expanded';

export interface LiveMeeting extends ScheduledMeeting {
  participantCount: number;
  viewerJoined: boolean;
}

/**
 * A meeting is current only when a presence source reports it live. Without
 * that evidence the section is absent; meeting time never implies liveness.
 */
export type CurrentMeetings =
  | { currentSource: 'unavailable'; current: [] }
  | { currentSource: 'presence'; current: LiveMeeting[] };

export type MeetingsHomeSchedule = CurrentMeetings & {
  upcoming: ScheduledMeeting[];
  /** Newest first. */
  past: ScheduledMeeting[];
  calendarAccess: CalendarAccess;
  viewerTimezone: ViewerTimezone;
  evaluatedAt: UtcInstant;
};

/** Background revalidation of an already rendered schedule. */
export type ScheduleSync = 'fresh' | 'refreshing' | 'stale';

export type MeetingsHomeState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; schedule: MeetingsHomeSchedule; sync: ScheduleSync };

export type PastFilter = 'all' | 'mine';

export type OlderMeetings =
  | { kind: 'complete' }
  | { kind: 'available' }
  | { kind: 'loading' }
  | { kind: 'failed' };

/** Results shown inside the expanded Past section. */
export type PastResults =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; meetings: ScheduledMeeting[]; older: OlderMeetings };

/** State and events of the Past section, owned by the page container. */
export interface PastController {
  choice: PastCollapseChoice;
  onChoiceChange: (choice: PastCollapseChoice) => void;
  /** Loaded past meetings; `more` marks an incomplete count. */
  count: { loaded: number; more: boolean };
  results: PastResults;
  search: string;
  onSearchChange: (search: string) => void;
  filter: PastFilter;
  onFilterChange: (filter: PastFilter) => void;
  onLoadOlder: () => void;
  onRetry: () => void;
}

export interface MeetingManagement {
  onEdit: (meeting: ScheduledMeeting) => void;
  onDelete: (meeting: ScheduledMeeting) => void;
}
