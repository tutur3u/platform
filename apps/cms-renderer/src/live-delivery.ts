import { parseCmsPageVersion } from '@tuturuuu/cms-blocks/schema';
import { z } from 'zod';
import { readJson } from './http-json';

const versionFields = {
  id: z.string().min(1), schema_version: z.number().int().positive(),
  status: z.literal('published').optional(),
  ws_id: z.string().optional(), entry_id: z.string().optional(),
};
const snapshotSchema = z.union([
  z.object({ ...versionFields, blocks: z.record(z.string(), z.unknown()) }),
  z.object({ ...versionFields, data: z.record(z.string(), z.unknown()) }),
]);
const payloadSchema = z.object({
  workspaceId: z.string(),
  collections: z.array(z.object({ entries: z.array(z.object({
    id: z.string(), slug: z.string(), title: z.string(), status: z.literal('published'),
    published_page_version_id: z.string().nullish(),
    metadata: z.object({ description: z.string().nullish(), ogImage: z.string().url().nullish() }).passthrough().nullish(),
    publishedPageVersion: snapshotSchema.nullish(),
  })) })),
});

type Result =
  | { kind: 'page'; versionId: string; page: NonNullable<ReturnType<typeof parseCmsPageVersion>>; title: string; description?: string; ogImage?: string }
  | { kind: 'missing' | 'unbound' | 'unavailable' };

/** Uses the live public API without auth/preview parameters or mutable-block fallbacks. */
export async function loadPublishedPage({ origin, workspaceId, path, fetch: fetcher }: {
  origin: string; workspaceId: string; path: string; fetch: typeof fetch;
}): Promise<Result> {
  try {
    const apiOrigin = new URL(origin);
    if (apiOrigin.protocol !== 'https:' || apiOrigin.username || apiOrigin.password) return { kind: 'unavailable' };
    const endpoint = new URL(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/external-projects/delivery`, apiOrigin);
    const response = await fetcher(endpoint, { signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (response.status === 409) return { kind: 'unbound' };
    if (response.status === 404) return { kind: 'missing' };
    if (!response.ok) return { kind: 'unavailable' };
    const payload = payloadSchema.parse(await readJson(response, 4 * 1024 * 1024));
    if (payload.workspaceId !== workspaceId) return { kind: 'unavailable' };
    const slug = path === '/' ? 'home' : path.slice(1);
    const entries = payload.collections.flatMap((collection) => collection.entries).filter((entry) => entry.slug === slug);
    if (entries.length !== 1) return { kind: 'missing' };
    const entry = entries[0];
    const snapshot = entry?.publishedPageVersion;
    if (!entry || !snapshot) return { kind: 'missing' };
    if ((snapshot.ws_id !== undefined && snapshot.ws_id !== workspaceId)
      || (snapshot.entry_id !== undefined && snapshot.entry_id !== entry.id)
      || (entry.published_page_version_id != null && entry.published_page_version_id !== snapshot.id)) return { kind: 'unavailable' };
    const page = parseCmsPageVersion({ data: 'blocks' in snapshot ? snapshot.blocks : snapshot.data, schema_version: snapshot.schema_version });
    if (!page) return { kind: 'unavailable' };
    return { kind: 'page', page, versionId: snapshot.id, title: entry.title,
      description: entry.metadata?.description ?? undefined, ogImage: entry.metadata?.ogImage ?? undefined };
  } catch { return { kind: 'unavailable' }; }
}
