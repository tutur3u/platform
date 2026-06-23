import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';

type ExternalCalendarProvider = 'google' | 'microsoft';

const PROVIDER_DISPLAY: Record<
  ExternalCalendarProvider,
  {
    alt: string;
    label: string;
    src: string;
    testId: string;
    title: string;
  }
> = {
  google: {
    alt: 'Google Calendar',
    label: 'Google Calendar',
    src: '/media/google-calendar-icon.png',
    testId: 'google-calendar-logo',
    title: 'Synced from Google Calendar',
  },
  microsoft: {
    alt: 'Microsoft Outlook',
    label: 'Microsoft Outlook',
    src: '/media/logos/microsoft.svg',
    testId: 'microsoft-outlook-logo',
    title: 'Synced from Microsoft Outlook',
  },
};

export function getCalendarEventProvider(
  event: Partial<
    Pick<CalendarEvent, 'provider' | 'external_event_id' | 'google_event_id'>
  >
): ExternalCalendarProvider | null {
  if (event.provider === 'google' || event.google_event_id) return 'google';
  if (event.provider === 'microsoft') return 'microsoft';
  return null;
}

export function getCalendarEventProviderDisplay(event: Partial<CalendarEvent>) {
  const provider = getCalendarEventProvider(event);
  return provider ? PROVIDER_DISPLAY[provider] : null;
}

export function CalendarEventProviderIcon({
  className,
  event,
}: {
  className?: string;
  event: Partial<CalendarEvent>;
}) {
  const display = getCalendarEventProviderDisplay(event);
  if (!display) return null;

  return (
    <Image
      src={display.src}
      alt={display.alt}
      className={cn('inline-block align-middle', className)}
      title={display.title}
      data-testid={display.testId}
      height={18}
      width={18}
    />
  );
}
