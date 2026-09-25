import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

export type LocationType = 'home' | 'office' | 'school' | 'custom' | null;

export function getLocationType(title: string): LocationType {
  const normalizedTitle = title.toLowerCase().trim();
  if (normalizedTitle === 'home') return 'home';
  if (normalizedTitle === 'office' || normalizedTitle === 'work')
    return 'office';
  if (normalizedTitle === 'school') return 'school';
  if (title.startsWith('📍') || title.startsWith('Location: ')) return 'custom';
  return null;
}

export function getEventLocationType(event: CalendarEvent): LocationType {
  if (event.scheduling_metadata?.google_event_type === 'workingLocation') {
    switch (event.scheduling_metadata.google_working_location_type) {
      case 'homeOffice':
        return 'home';
      case 'officeLocation':
        return 'office';
      case 'customLocation': {
        const label = event.scheduling_metadata.google_working_location_label;
        return (typeof label === 'string' &&
          label.trim().toLowerCase() === 'school') ||
          event.title?.trim().toLowerCase() === 'school'
          ? 'school'
          : 'custom';
      }
      default:
        return 'custom';
    }
  }
  return getLocationType(event.title ?? '');
}
