import { z } from 'zod';
import { fail } from '../cli/operational-schema';
import { OperationalStore } from '../cli/operational-store';
import {
  OUTCOME_PROJECTION_MAX_BYTES,
  type OutcomeProjectionRequest,
  outcomeProjectionRequestSchema,
} from './contracts';
import { buildOutcomeProjectionPage } from './projection';

export function readOutcomeProjectionPage({
  store,
  ...request
}: OutcomeProjectionRequest & { store: OperationalStore }) {
  const { limit, cursor } = outcomeProjectionRequestSchema.parse(request);
  if (store.kind !== 'backlog')
    fail('STORE_KIND_MISMATCH', 'outcome projection requires a backlog store');
  if (store.writable)
    fail('READ_ONLY', 'outcome projection requires a read-only store');
  return store.read(() => {
    const capacity = z
      .object({ items: z.number(), events: z.number(), bytes: z.number() })
      .parse(
        store.db
          .prepare(`SELECT
        (SELECT COUNT(*) FROM items) AS items,
        (SELECT COUNT(*) FROM events) AS events,
        COALESCE((SELECT SUM(length(CAST(payload AS BLOB))) FROM items),0)
        + COALESCE((SELECT SUM(length(CAST(payload AS BLOB))) FROM events),0) AS bytes`)
          .get()
      );
    if (
      capacity.items > 10_000 ||
      capacity.events > 100_000 ||
      capacity.bytes > OUTCOME_PROJECTION_MAX_BYTES
    )
      fail(
        'PROJECTION_CAPACITY',
        'projection exceeds record or 32 MiB input bounds'
      );
    return buildOutcomeProjectionPage({
      snapshot: {
        sourceDatabaseId: store.identity(),
        revision: store.revision(),
        items: [...store.readItems().values()],
        events: store.history(),
      },
      limit,
      cursor,
    });
  });
}

export function readOutcomeProjectionPageFromPath({
  path,
  ...request
}: OutcomeProjectionRequest & { path: string }) {
  const { limit, cursor } = outcomeProjectionRequestSchema.parse(request);
  const store = new OperationalStore(path, 'backlog');
  try {
    return readOutcomeProjectionPage({ store, limit, cursor });
  } finally {
    store.close();
  }
}
