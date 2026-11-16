/** UTC ISO 8601 instants; presentation belongs to the viewer's timezone. */
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

export interface PastMeetingPreference {
  store: 'user-workspace-config';
  configId: 'MEET_PAST_MEETINGS_COLLAPSE';
  accountId: string;
  workspaceId: string;
  choice: PastCollapseChoice;
}

/** No time-based heuristic establishes that a room is currently live. */
export type CurrentMeetings = {
  currentSource: 'unavailable';
  current: [];
};

export type MeetingSchedule = CurrentMeetings & {
  upcoming: ScheduledMeeting[];
  past: ScheduledMeeting[];
  calendarAccess: CalendarAccess;
  viewerTimezone: ViewerTimezone;
  pastPreference: PastMeetingPreference;
  /** Search is applied before classification; Past is ordered newest first. */
  search: string;
  evaluatedAt: UtcInstant;
};
