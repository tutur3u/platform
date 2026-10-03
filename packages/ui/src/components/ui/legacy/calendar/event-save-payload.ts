import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { newCalendarCreationRequestId } from '../../../../hooks/calendar-creation-request';

/** Existing edits send only changed fields so a color-only command neither
 * broadcasts invitations nor accidentally becomes a calendar transfer. */
export function eventSavePayload(
  draft: Partial<CalendarEvent>,
  original?: Partial<CalendarEvent>,
  sourceChanged = false
) {
  if (!original || original.id === 'new') return draft;
  const updates: Partial<CalendarEvent> = {};
  for (const field of [
    'title',
    'description',
    'location',
    'start_at',
    'end_at',
    'locked',
  ] as const) {
    if (
      (draft[field] ?? (field === 'locked' ? false : '')) !==
      (original[field] ?? (field === 'locked' ? false : ''))
    )
      Object.assign(updates, { [field]: draft[field] });
  }
  if (draft.providerColor) updates.providerColor = draft.providerColor;
  else if (draft.color !== original.color) updates.color = draft.color;
  if (sourceChanged) updates.source = draft.source;
  return updates;
}

export function eventModalSavePayload(
  draft: Partial<CalendarEvent>,
  original: Partial<CalendarEvent> | undefined,
  source: CalendarEvent['source'],
  sourceChanged: boolean
) {
  return eventSavePayload(
    {
      title: draft.title || '',
      description: draft.description || '',
      start_at: draft.start_at,
      end_at: draft.end_at,
      color: draft.color || 'BLUE',
      location: draft.location || '',
      locked: draft.locked || false,
      source,
      providerColor: draft.providerColor,
    },
    original,
    sourceChanged
  );
}

export function eventModalDraft(
  activeEvent: CalendarEvent
): Partial<CalendarEvent> {
  return {
    id: activeEvent.id,
    requestId:
      activeEvent.id === 'new' ? newCalendarCreationRequestId() : undefined,
    title: activeEvent.title || '',
    description: activeEvent.description || '',
    start_at: activeEvent.start_at,
    end_at: activeEvent.end_at,
    color: activeEvent.color || 'BLUE',
    location: activeEvent.location || '',
    locked: activeEvent.locked || false,
    ws_id: activeEvent.ws_id,
    provider: activeEvent.provider,
    source_calendar_id: activeEvent.source_calendar_id,
    external_calendar_id: activeEvent.external_calendar_id,
    external_event_id: activeEvent.external_event_id,
    google_event_id: activeEvent.google_event_id,
    google_calendar_id: activeEvent.google_calendar_id,
    scheduling_metadata: activeEvent.scheduling_metadata,
  };
}
