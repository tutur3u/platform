import { fingerprintWork } from '@tuturuuu/cite';
import {
  CitationLibraryError,
  type CitationLibraryItem,
  type CitationLibraryScope,
  type CitationLibraryStore,
  citationLibraryItemSchema,
  batchLibraryItemsSchema,
  createLibraryItemSchema,
  libraryQuerySchema,
  updateLibraryItemSchema,
} from './contracts';

function scoped(item: CitationLibraryItem, wsId: string) {
  const parsed = citationLibraryItemSchema.safeParse(item);
  if (!parsed.success || parsed.data.wsId !== wsId)
    throw new CitationLibraryError('LIBRARY_UNAVAILABLE', 503);
  return parsed.data;
}

function boundedWork(work: CitationLibraryItem['work']) {
  if (new TextEncoder().encode(JSON.stringify(work)).byteLength > 60000)
    throw new CitationLibraryError('INVALID_INPUT', 413);
}

export function createCitationLibraryService(store: CitationLibraryStore) {
  return {
    async list(scope: CitationLibraryScope, query: unknown) {
      const parsed = libraryQuerySchema.safeParse(query);
      if (!parsed.success) throw new CitationLibraryError('INVALID_INPUT', 400);
      const items = await store.list(scope.wsId, parsed.data);
      if (items.length > parsed.data.limit)
        throw new CitationLibraryError('LIBRARY_UNAVAILABLE', 503);
      return {
        items: items.map((item) => scoped(item, scope.wsId)),
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      };
    },
    async get(scope: CitationLibraryScope, id: string) {
      const item = await store.get(scope.wsId, id);
      if (!item) throw new CitationLibraryError('NOT_FOUND', 404);
      return scoped(item, scope.wsId);
    },
    async getMany(scope: CitationLibraryScope, input: unknown) {
      const parsed = batchLibraryItemsSchema.safeParse(input);
      if (!parsed.success) throw new CitationLibraryError('INVALID_INPUT', 400);
      const rows = await store.getMany(scope.wsId, parsed.data.ids);
      const requested = new Set(parsed.data.ids);
      const items = rows.map((row) => scoped(row, scope.wsId));
      const returned = new Set(items.map((item) => item.id));
      if (
        items.length > requested.size ||
        returned.size !== items.length ||
        items.some((item) => !requested.has(item.id))
      )
        throw new CitationLibraryError('LIBRARY_UNAVAILABLE', 503);
      return {
        items,
        missingIds: parsed.data.ids.filter((id) => !returned.has(id)),
      };
    },
    async create(scope: CitationLibraryScope, input: unknown) {
      const parsed = createLibraryItemSchema.safeParse(input);
      if (!parsed.success) throw new CitationLibraryError('INVALID_INPUT', 400);
      boundedWork(parsed.data.work);
      const existing = await store.get(scope.wsId, parsed.data.id);
      if (existing) {
        const item = scoped(existing, scope.wsId);
        if (
          item.ownerUserId === scope.actorId &&
          JSON.stringify(item.work) === JSON.stringify(parsed.data.work) &&
          JSON.stringify(item.tags) === JSON.stringify(parsed.data.tags)
        )
          return { item, created: false };
        throw new CitationLibraryError('VERSION_CONFLICT', 409);
      }
      const fingerprint = await fingerprintWork(parsed.data.work);
      const duplicate = await store.findFingerprint(scope.wsId, fingerprint);
      if (duplicate)
        throw new CitationLibraryError(
          'DUPLICATE_SOURCE',
          409,
          scoped(duplicate, scope.wsId).id
        );
      try {
        const item = scoped(
          await store.insert(scope, { ...parsed.data, fingerprint }),
          scope.wsId
        );
        return { item, created: true };
      } catch (error) {
        if (
          error instanceof CitationLibraryError &&
          error.code === 'DUPLICATE_SOURCE'
        ) {
          const winner = await store.findFingerprint(scope.wsId, fingerprint);
          throw new CitationLibraryError(
            'DUPLICATE_SOURCE',
            409,
            winner ? scoped(winner, scope.wsId).id : undefined
          );
        }
        throw error;
      }
    },
    async update(scope: CitationLibraryScope, id: string, input: unknown) {
      const parsed = updateLibraryItemSchema.safeParse(input);
      if (!parsed.success) throw new CitationLibraryError('INVALID_INPUT', 400);
      boundedWork(parsed.data.work);
      const fingerprint = await fingerprintWork(parsed.data.work);
      const item = await store.update(scope.wsId, id, {
        ...parsed.data,
        fingerprint,
      });
      if (!item) {
        const existing = await store.get(scope.wsId, id);
        throw new CitationLibraryError(
          existing ? 'VERSION_CONFLICT' : 'NOT_FOUND',
          existing ? 409 : 404
        );
      }
      const result = scoped(item, scope.wsId);
      if (result.version !== parsed.data.expectedVersion + 1)
        throw new CitationLibraryError('LIBRARY_UNAVAILABLE', 503);
      return result;
    },
    async remove(
      scope: CitationLibraryScope,
      id: string,
      expectedVersion: number
    ) {
      if (await store.remove(scope.wsId, id, expectedVersion)) return;
      const existing = await store.get(scope.wsId, id);
      if (existing) throw new CitationLibraryError('VERSION_CONFLICT', 409);
    },
  };
}
