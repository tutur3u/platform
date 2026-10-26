export async function cleanupLegacyCalendarCaches({
  origin,
  storage,
}: {
  origin: string;
  storage: Pick<CacheStorage, 'keys' | 'delete'>;
}) {
  if (origin !== 'https://calendar.tuturuuu.com') return;
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
