import { validateProjection } from '../cli/operational-domain';
import {
  canonical,
  digest,
  fail,
  type Item,
  itemSchema,
  parseJson,
} from '../cli/operational-schema';
import {
  OUTCOME_PROJECTION_MAX_BYTES,
  OUTCOME_PROJECTION_VERSION,
  type OutcomeProjectionPage,
  type OutcomeProjectionRecord,
  type OutcomeProjectionRequest,
  outcomeProjectionPageSchema,
  outcomeProjectionRequestSchema,
  outcomeSnapshotSchema,
} from './contracts';

function freeze(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
}

export function buildOutcomeProjectionPage({
  snapshot: input,
  ...request
}: OutcomeProjectionRequest & { snapshot: unknown }): OutcomeProjectionPage {
  const { limit, cursor } = outcomeProjectionRequestSchema.parse(request);
  const snapshot = outcomeSnapshotSchema.parse(input);
  if (
    new TextEncoder().encode(canonical(snapshot)).length >
    OUTCOME_PROJECTION_MAX_BYTES
  )
    fail('PROJECTION_CAPACITY', 'projection exceeds the 32 MiB input bound');
  const items = new Map(snapshot.items.map((item) => [item.id, item]));
  if (items.size !== snapshot.items.length)
    fail('INVALID_HISTORY', 'duplicate projection id');
  if (
    snapshot.events.length !== snapshot.revision ||
    snapshot.events.some((event, index) => event.seq !== index + 1)
  )
    fail('INVALID_HISTORY', 'complete contiguous history required');

  const latest = new Map<string, Item>();
  const provenance = new Map<
    string,
    OutcomeProjectionRecord['members'][number]['provenance']['events'][number][]
  >();
  for (const event of snapshot.events) {
    const item = itemSchema.parse(parseJson(event.payload));
    if (item.id !== event.item_id) fail('INVALID_HISTORY', 'event id mismatch');
    latest.set(item.id, item);
    const events = provenance.get(item.id) ?? [];
    events.push({
      seq: event.seq,
      at: event.at,
      action: event.action,
      payloadHash: digest(parseJson(event.payload)),
    });
    provenance.set(item.id, events);
  }
  if (
    latest.size !== items.size ||
    [...items].some(
      ([id, item]) => canonical(latest.get(id) ?? null) !== canonical(item)
    )
  )
    fail('INVALID_HISTORY', 'projection differs from final event payload');
  validateProjection(items);

  const snapshotHash = digest(snapshot);
  if (
    cursor &&
    (cursor.sourceDatabaseId !== snapshot.sourceDatabaseId ||
      cursor.revision !== snapshot.revision ||
      cursor.snapshotHash !== snapshotHash)
  )
    fail(
      'PROJECTION_REVISION_CONFLICT',
      'projection cursor belongs to a different snapshot'
    );
  if (cursor && !items.has(cursor.afterId))
    fail('INVALID_INPUT', 'projection cursor item is missing');

  const ordered = [...items.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  const start = cursor
    ? ordered.findIndex((item) => item.id === cursor.afterId) + 1
    : 0;
  const selected = ordered.slice(start, start + limit);
  const records = selected.map((item) => {
    const events = provenance.get(item.id);
    const first = events?.[0];
    const last = events?.at(-1);
    if (!events || !first || !last)
      return fail('INVALID_HISTORY', 'projection item lacks provenance');
    return {
      id: item.id,
      canonicalId: item.id,
      contributingIds: [item.id],
      members: [
        {
          item,
          provenance: {
            itemId: item.id,
            source: item.source,
            firstEventSeq: first.seq,
            lastEventSeq: last.seq,
            events,
          },
        },
      ],
    };
  });
  const last = selected.at(-1);
  const result = outcomeProjectionPageSchema.parse({
    projectionVersion: OUTCOME_PROJECTION_VERSION,
    sourceDatabaseId: snapshot.sourceDatabaseId,
    revision: snapshot.revision,
    snapshotHash,
    semanticCacheAllowed: snapshot.sourceDatabaseId !== null,
    records,
    nextCursor:
      last && start + selected.length < ordered.length
        ? {
            projectionVersion: OUTCOME_PROJECTION_VERSION,
            sourceDatabaseId: snapshot.sourceDatabaseId,
            revision: snapshot.revision,
            snapshotHash,
            afterId: last.id,
          }
        : null,
    liveVerificationPerformed: false,
  });
  freeze(result);
  return result;
}
