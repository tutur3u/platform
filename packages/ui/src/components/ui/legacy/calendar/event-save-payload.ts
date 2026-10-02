import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

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
