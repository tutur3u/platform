import { CALENDAR_ROOT_ORIGIN } from '../constants/calendar-origins';

export async function cleanupLegacyCalendarCaches({
  origin,
  storage,
}: {
  origin: string;
  storage: Pick<CacheStorage, 'keys' | 'delete'>;
}) {
  if (origin !== CALENDAR_ROOT_ORIGIN) return;
  const names = await storage.keys();
  await Promise.all(
    names
      .filter(
        (name) =>
          name.startsWith('tuturuuu-offline-precache-') ||
          name === 'tuturuuu-offline-runtime-v1'
      )
      .map((name) => storage.delete(name))
  );
}
