import { User } from '../db';
import { Workspace } from '../db';

// Event scheduling types (temporary manual definitions until database schema is created)
export type EventAttendeeStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'tentative';
export type EventStatus = 'active' | 'cancelled' | 'completed' | 'draft';

export type WorkspaceScheduledEvent = {
  id: string;
  ws_id: string;
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  location?: string;
  color?: string;
  creator_id: string;
  is_all_day?: boolean;
  recurrence_rule?: string;
  requires_confirmation?: boolean;
  status?: EventStatus;
  created_at?: string;
  updated_at?: string;
};

export type EventAttendee = {
  id: string;
  event_id: string;
  user_id: string;
  status: EventAttendeeStatus;
  response_at?: string;
  created_at?: string;
  updated_at?: string;
};

// Extended types for the frontend
export type WorkspaceScheduledEventWithAttendees = WorkspaceScheduledEvent & {
  attendees?: EventAttendeeWithUser[];
  creator?: User;
  attendee_count?: {
    total: number;
    accepted: number;
    declined: number;
    pending: number;
    tentative: number;
  };
};

export type EventAttendeeWithUser = EventAttendee & {
  user?: User;
};

export type EventInvitationData = {
  event: WorkspaceScheduledEventWithAttendees;
  attendee: EventAttendee;
  workspace: Workspace;
};
