import { createHash } from 'node:crypto';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { ExternalProjectDeliveryPayload } from '@tuturuuu/types';
import { z } from 'zod';
import { getPublishedPageVersion } from './page-versions';

export async function attachPublishedPageVersions(
  payload: ExternalProjectDeliveryPayload,
  admin: TypedSupabaseClient
) {
  const entries = payload.collections
    .flatMap((collection) => collection.entries)
    .flatMap((entry) => {
      const pointer = z
        .object({ published_page_version_id: z.uuid().nullish() })
        .parse(entry).published_page_version_id;
      return pointer ? [{ entry, pointer }] : [];
    });
  if (entries.length > 200)
    throw new Error('CMS page delivery exceeds entry limit');
  const versions = new Map<
    string,
    Awaited<ReturnType<typeof getPublishedPageVersion>>
  >();
  for (let offset = 0; offset < entries.length; offset += 8) {
    await Promise.all(
      entries.slice(offset, offset + 8).map(async ({ entry, pointer }) => {
        const version = await getPublishedPageVersion(admin, {
          workspaceId: payload.workspaceId,
          entryId: entry.id,
        });
        if (
          version &&
          (version.id !== pointer ||
            version.status !== 'published' ||
            version.ws_id !== payload.workspaceId ||
            version.entry_id !== entry.id)
        ) {
          throw new Error('Published page scope mismatch');
        }
        versions.set(entry.id, version);
      })
    );
  }
  const collections = payload.collections.map((collection) => ({
    ...collection,
    entries: collection.entries.map((entry) => ({
      ...entry,
      publishedPageVersion: versions.get(entry.id) ?? null,
    })),
  }));
  const revision = createHash('sha256')
    .update(
      JSON.stringify([
        payload.revision,
        collections.flatMap((collection) =>
          collection.entries.map((entry) => [
            entry.id,
            entry.publishedPageVersion?.id ?? null,
          ])
        ),
      ])
    )
    .digest('hex');
  return { ...payload, collections, revision };
}
