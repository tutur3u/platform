export function formatTopicAnnouncementInstant(
  value: string | null | undefined,
  timezone: string
) {
  if (!value) return null;

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

export function isSchedulingTimezoneReady(timezone: string | null | undefined) {
  return Boolean(timezone?.trim() && timezone !== 'auto');
}
