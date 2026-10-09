import { readFile } from 'node:fs/promises';
import type { LettinDraft } from '@tuturuuu/internal-api/lettin';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { type Actor, LettinError, type Store } from './context';
import { getMedia, uploadMedia } from './media';
import { cleanupMedia } from './media-cleanup';
import { mutate } from './mutations';
import { readPublic, readWorld } from './queries';

let mf: Miniflare;
let db: Store;
let bucket: R2Bucket;
const owner: Actor = {
  id: 'owner',
  wsId: 'workspace',
  isAdmin: true,
  canManage: true,
  verifiedEmail: async () => null,
  eligibleMember: async () => true,
  memberNames: async () => [],
};
const draft: LettinDraft = {
  title: 'Notebook',
  description: '',
  image: '',
  credit: '',
  kind: 'page',
  tags: [],
  links: [],
  content: { type: 'doc' },
};
let worldId: string;
const anonymous = async () => {
  throw new LettinError(403);
};
const art = (image: string, caption = 'Published caption') => ({
  image,
  alt: 'Portrait',
  caption,
  credit: 'Artist',
});
async function upload(world = worldId) {
  return (
    await uploadMedia(
      db,
      bucket,
      owner,
      world,
      new File(['fixture image'], 'art.png', { type: 'image/png' })
    )
  ).image;
}
const mediaId = (image: string) => image.split('/').at(-1)!;
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      compatibilityDate: '2026-09-14',
      d1Databases: ['DB'],
      r2Buckets: ['MEDIA'],
    })
  );
  db = await mf.getD1Database('DB');
  bucket = (await mf.getR2Bucket('MEDIA')) as unknown as R2Bucket;
  for (const name of [
    '0001_worldbuilding.sql',
    '0002_public_indexes.sql',
    '0003_media_cleanup.sql',
    '0004_creator_imports_and_moderation.sql',
  ]) {
    const sql = await readFile(
      new URL(`../../migrations/${name}`, import.meta.url),
      'utf8'
    );
    await db.batch(
      sql
        .replace(/^--.*$/gm, '')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => db.prepare(s))
    );
  }
}, 30000);
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  await db.batch(
    ['media', 'entries', 'collaborators', 'worlds', 'creators'].map((t) =>
      db.prepare(`DELETE FROM ${t}`)
    )
  );
  worldId = (await mutate(db, owner, { action: 'createWorld', draft })).id;
});
it('keeps gallery drafts private and preserves older publication until republished', async () => {
  const image = await upload();
  await mutate(db, owner, {
    action: 'saveWorld',
    worldId,
    version: 1,
    draft: { ...draft, gallery: [art(image)] },
  });
  await expect(
    getMedia(db, bucket, mediaId(image), anonymous)
  ).rejects.toMatchObject({ status: 404 });
  expect(await readPublic(db, worldId)).toEqual([]);
  await mutate(db, owner, { action: 'publishWorld', worldId, version: 2 });
  expect((await getMedia(db, bucket, mediaId(image), anonymous)).status).toBe(
    200
  );
  const next = await upload();
  await mutate(db, owner, {
    action: 'saveWorld',
    worldId,
    version: 3,
    draft: { ...draft, gallery: [art(next, 'Private replacement')] },
  });
  expect((await readPublic(db, worldId))[0]!.published.gallery).toEqual([
    art(image),
  ]);
  expect((await readPublic(db))[0]!.published).not.toHaveProperty('gallery');
  await expect(
    getMedia(db, bucket, mediaId(next), anonymous)
  ).rejects.toMatchObject({ status: 404 });
  await mutate(db, owner, { action: 'unpublishWorld', worldId, version: 4 });
  await expect(
    getMedia(db, bucket, mediaId(image), anonymous)
  ).rejects.toMatchObject({ status: 404 });
  expect(
    (await getMedia(db, bucket, mediaId(next), async () => owner)).status
  ).toBe(200);
});
it('requires both published notebook and published entry for anonymous entry artwork', async () => {
  const image = await upload();
  const entryId = (
    await mutate(db, owner, {
      action: 'createEntry',
      worldId,
      draft: { ...draft, gallery: [art(image)] },
    })
  ).id;
  await mutate(db, owner, {
    action: 'publishEntry',
    worldId,
    entryId,
    version: 1,
  });
  await expect(
    getMedia(db, bucket, mediaId(image), anonymous)
  ).rejects.toMatchObject({ status: 404 });
  await mutate(db, owner, { action: 'publishWorld', worldId, version: 1 });
  expect((await getMedia(db, bucket, mediaId(image), anonymous)).status).toBe(
    200
  );
  expect(
    (await readPublic(db, worldId))[0]!.entries[0]!.published.gallery
  ).toEqual([art(image)]);
  await mutate(db, owner, {
    action: 'unpublishEntry',
    worldId,
    entryId,
    version: 2,
  });
  await expect(
    getMedia(db, bucket, mediaId(image), anonymous)
  ).rejects.toMatchObject({ status: 404 });
});
it('rejects foreign notebook artwork during create and save without changing the draft', async () => {
  const other = (await mutate(db, owner, { action: 'createWorld', draft })).id;
  const image = await upload(other);
  await expect(
    mutate(db, owner, {
      action: 'createEntry',
      worldId,
      draft: { ...draft, gallery: [art(image)] },
    })
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    mutate(db, owner, {
      action: 'saveWorld',
      worldId,
      version: 1,
      draft: { ...draft, gallery: [art(image)] },
    })
  ).rejects.toMatchObject({ status: 409 });
  expect((await readWorld(db, owner, worldId)).world.draft).toEqual(draft);
});
it('retains removed draft artwork while published, then cleans it after republishing', async () => {
  const image = await upload();
  const id = mediaId(image);
  await mutate(db, owner, {
    action: 'saveWorld',
    worldId,
    version: 1,
    draft: { ...draft, gallery: [art(image)] },
  });
  await db
    .prepare('UPDATE media SET created_at=? WHERE id=?')
    .bind('2000-01-01T00:00:00.000Z', id)
    .run();
  await cleanupMedia(db, bucket, worldId);
  expect(
    await db.prepare('SELECT 1 FROM media WHERE id=?').bind(id).first()
  ).toBeTruthy();
  await mutate(db, owner, { action: 'publishWorld', worldId, version: 2 });
  await mutate(db, owner, { action: 'saveWorld', worldId, version: 3, draft });
  await cleanupMedia(db, bucket, worldId);
  expect((await getMedia(db, bucket, id, anonymous)).status).toBe(200);
  await mutate(db, owner, { action: 'publishWorld', worldId, version: 4 });
  await cleanupMedia(db, bucket, worldId);
  expect(
    await db.prepare('SELECT 1 FROM media WHERE id=?').bind(id).first()
  ).toBeNull();
  await expect(
    getMedia(db, bucket, id, async () => owner)
  ).rejects.toMatchObject({ status: 404 });
});
it('rejects media claimed for deletion before saving gallery references', async () => {
  const image = await upload();
  await db
    .prepare('UPDATE media SET deleting=1 WHERE id=?')
    .bind(mediaId(image))
    .run();
  await expect(
    mutate(db, owner, {
      action: 'saveWorld',
      worldId,
      version: 1,
      draft: { ...draft, gallery: [art(image)] },
    })
  ).rejects.toMatchObject({ status: 409 });
  expect((await readWorld(db, owner, worldId)).world.version).toBe(1);
});
