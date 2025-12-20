/**
 * Microsoft Calendar API utilities
 *
 * Provides types and helpers for working with Microsoft Outlook calendars
 * via the Microsoft Graph API.
 */

import type { Client } from '@microsoft/microsoft-graph-client';

// Microsoft Event type (simplified from Graph API)
export interface MicrosoftCalendarEvent {
  id: string;
  subject: string;
  body?: {
    contentType: 'text' | 'html';
    content: string;
  };
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName: string;
  };
  isAllDay: boolean;
  isCancelled: boolean;
  isOrganizer: boolean;
  organizer?: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  attendees?: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
    status: {
      response:
        | 'none'
        | 'organizer'
        | 'tentativelyAccepted'
        | 'accepted'
        | 'declined'
        | 'notResponded';
    };
  }>;
  webLink?: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
}

// Microsoft Calendar type
export interface MicrosoftCalendar {
  id: string;
  name: string;
  color: string;
  hexColor?: string;
  isDefaultCalendar: boolean;
  canEdit: boolean;
  owner?: {
    name: string;
    address: string;
  };
}

// Color mapping from Microsoft Graph color names to hex
export const MICROSOFT_CALENDAR_COLORS: Record<string, string> = {
  auto: '#0078D4',
  lightBlue: '#71AFE5',
  lightGreen: '#7ED321',
  lightOrange: '#FFBE00',
  lightGray: '#A0AEB2',
  lightYellow: '#FFF100',
  lightTeal: '#00ABA9',
  lightPink: '#FF69B4',
  lightBrown: '#D2691E',
  lightRed: '#FF6347',
  maxColor: '#0078D4',
};

// Fetch calendars from Microsoft Graph
export async function fetchMicrosoftCalendars(
  client: Client
): Promise<MicrosoftCalendar[]> {
  const response = await client.api('/me/calendars').get();

  return (response.value || []).map((cal: any) => ({
    id: cal.id,
    name: cal.name,
    color: cal.color || 'auto',
    hexColor:
      MICROSOFT_CALENDAR_COLORS[cal.color] || MICROSOFT_CALENDAR_COLORS.auto,
    isDefaultCalendar: cal.isDefaultCalendar || false,
    canEdit: cal.canEdit || false,
    owner: cal.owner
      ? {
          name: cal.owner.name,
          address: cal.owner.address,
        }
      : undefined,
  }));
}

// Fetch events from a Microsoft calendar
export async function fetchMicrosoftEvents(
  client: Client,
  calendarId: string,
  startDateTime: string,
  endDateTime: string
): Promise<MicrosoftCalendarEvent[]> {
  const response = await client
    .api(`/me/calendars/${calendarId}/calendarView`)
    .query({
      startDateTime,
      endDateTime,
      $top: 500,
      $orderby: 'start/dateTime',
    })
    .get();

  return response.value || [];
}

// Convert Microsoft event to workspace calendar event format
export function convertMicrosoftEventToWorkspaceFormat(
  event: MicrosoftCalendarEvent,
  wsId: string,
  calendarId: string,
  color?: string
): {
  google_event_id: string;
  google_calendar_id: string;
  ws_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  color: string | null;
  is_all_day: boolean;
  location: string | null;
} {
  return {
    google_event_id: event.id, // Using same field for compatibility
    google_calendar_id: calendarId,
    ws_id: wsId,
    title: event.subject || 'Untitled',
    description: event.body?.content || null,
    start_at: event.start.dateTime,
    end_at: event.end.dateTime,
    color: color ?? MICROSOFT_CALENDAR_COLORS.auto ?? null,
    is_all_day: event.isAllDay,
    location: event.location?.displayName || null,
  };
}
