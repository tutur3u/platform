type CalendarEventIdentity = {
  description?: string | null;
  end_at: string;
  external_calendar_id?: string | null;
  external_event_id?: string | null;
  google_calendar_id?: string | null;
  google_event_id?: string | null;
  id?: string;
  location?: string | null;
  provider?: string | null;
  start_at: string;
  title: string;
};

function normalizeIdentityText(value: string | null | undefined) {
  return value?.trim().replaceAll(/\s+/gu, ' ').toLocaleLowerCase() ?? '';
}

function externalIdentity(event: CalendarEventIdentity) {
  const provider = event.provider?.trim().toLocaleLowerCase();
  const externalCalendarId =
    event.external_calendar_id ?? event.google_calendar_id;
  const externalEventId = event.external_event_id ?? event.google_event_id;

  if (!provider || provider === 'tuturuuu' || !externalEventId) {
    return null;
  }

  return [provider, externalCalendarId ?? '', externalEventId].join('\u0000');
}

function externalSemanticIdentity(event: CalendarEventIdentity) {
  const provider = event.provider?.trim().toLocaleLowerCase();
  if (!provider || provider === 'tuturuuu') return null;

  return [
    provider,
    event.start_at,
    event.end_at,
    normalizeIdentityText(event.title),
    normalizeIdentityText(event.description),
    normalizeIdentityText(event.location),
  ].join('\u0000');
}

function visibleSemanticIdentity(event: CalendarEventIdentity) {
  return [
    event.start_at,
    event.end_at,
    normalizeIdentityText(event.title),
  ].join('\u0000');
}

/**
 * Suppress duplicate provider rows and native/provider mirror pairs.
 *
 * Provider accounts can expose the same shared calendar or birthday feed under
 * different connection identities. A native event can also be mirrored to a
 * provider and return through the import feed. The database correctly retains
 * each source, while this read-boundary projection renders one occurrence.
 */
export function deduplicateCalendarEvents<T extends CalendarEventIdentity>(
  events: T[]
): T[] {
  const seenIds = new Set<string>();
  const seenExternalIdentities = new Set<string>();
  const seenExternalSemanticIdentities = new Set<string>();
  const seenVisibleSemanticSources = new Map<string, string>();

  return events.filter((event) => {
    if (event.id && seenIds.has(event.id)) return false;

    const providerIdentity = externalIdentity(event);
    if (providerIdentity && seenExternalIdentities.has(providerIdentity)) {
      return false;
    }

    const semanticIdentity = externalSemanticIdentity(event);
    if (
      semanticIdentity &&
      seenExternalSemanticIdentities.has(semanticIdentity)
    ) {
      return false;
    }

    // A mirrored provider event can coexist with the native Tuturuuu row that
    // initiated the write. They intentionally have different provider IDs and
    // may not share provider-only metadata, but rendering both is always a
    // duplicate from the user's perspective. Suppress an otherwise identical
    // visible occurrence only when it crosses source boundaries.
    const source = event.provider?.trim().toLocaleLowerCase() || 'tuturuuu';
    const visibleIdentity = visibleSemanticIdentity(event);
    const existingSource = seenVisibleSemanticSources.get(visibleIdentity);
    if (existingSource && existingSource !== source) return false;

    if (event.id) seenIds.add(event.id);
    if (providerIdentity) seenExternalIdentities.add(providerIdentity);
    if (semanticIdentity) {
      seenExternalSemanticIdentities.add(semanticIdentity);
    }
    seenVisibleSemanticSources.set(visibleIdentity, source);

    return true;
  });
}
