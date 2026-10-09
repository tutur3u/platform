import { readFile } from 'node:fs/promises';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createStarterDraft } from '../components/starter-drafts';
import type { Actor, Store } from './context';
import { mutate } from './mutations';
import { readPublic } from './queries';

let mf: Miniflare;
let db: Store;
const actor: Actor = {
  id: 'owner',
  wsId: 'workspace',
  isAdmin: true,
  canManage: true,
  verifiedEmail: async () => 'owner@example.test',
  eligibleMember: async () => true,
  memberNames: async () => [],
};
const draft = createStarterDraft('Notebook', 'blank', (key) => key);
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      compatibilityDate: '2026-09-14',
      d1Databases: ['DB'],
    })
  );
  db = await mf.getD1Database('DB');
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
    ['entries', 'collaborators', 'worlds'].map((table) =>
      db.prepare(`DELETE FROM ${table}`)
    )
  );
});
it('uses exact published tags and keeps later draft revisions out of summaries and filters', async () => {
  const tags = ["Rồng & lore's", 'Fantasy'];
  const worldId = (
    await mutate(db, actor, {
      action: 'createWorld',
      draft: { ...draft, tags },
    })
  ).id;
  await mutate(db, actor, { action: 'publishWorld', worldId, version: 1 });
  await mutate(db, actor, {
    action: 'saveWorld',
    worldId,
    version: 2,
    draft: { ...draft, tags: ['private-revision'] },
  });
  const result = await readPublic(db, undefined, { tag: tags[0] });
  expect(result).toHaveLength(1);
  expect(result[0]?.published.tags).toEqual(tags);
  expect(result[0]?.entries).toEqual([]);
  expect(result[0]?.published.content.content).toEqual([]);
  for (const tag of ['private-revision', 'fantasy', '%', "' OR 1=1 --"])
    expect(await readPublic(db, undefined, { tag })).toEqual([]);
  await mutate(db, actor, { action: 'publishWorld', worldId, version: 3 });
  expect(await readPublic(db, undefined, { tag: tags[0] })).toEqual([]);
  expect(
    await readPublic(db, undefined, { tag: 'private-revision' })
  ).toHaveLength(1);
});
it('filters before pagination and intersects tag, creator and text search', async () => {
  for (let i = 0; i < 30; i++) {
    const worldId = (
      await mutate(db, actor, {
        action: 'createWorld',
        draft: {
          ...draft,
          title: `Notebook ${i}`,
          tags: [i < 27 ? 'chosen' : 'other'],
        },
      })
    ).id;
    await mutate(db, actor, { action: 'publishWorld', worldId, version: 1 });
  }
  const filters = { tag: 'chosen', creatorId: actor.id, search: 'Notebook' };
  expect(await readPublic(db, undefined, filters)).toHaveLength(25);
  expect(await readPublic(db, undefined, { ...filters, page: 2 })).toHaveLength(
    3
  );
  expect(
    await readPublic(db, undefined, { ...filters, creatorId: 'outsider' })
  ).toEqual([]);
  expect(
    await readPublic(db, undefined, { ...filters, search: 'missing' })
  ).toEqual([]);
});
it('keeps historical snapshots without tags compatible and excludes private notebooks', async () => {
  const worldId = (
    await mutate(db, actor, {
      action: 'createWorld',
      draft: { ...draft, tags: ['private'] },
    })
  ).id;
  expect(await readPublic(db, undefined, { tag: 'private' })).toEqual([]);
  await mutate(db, actor, { action: 'publishWorld', worldId, version: 1 });
  await db
    .prepare(
      "UPDATE worlds SET published=json_remove(published,'$.tags') WHERE id=?"
    )
    .bind(worldId)
    .run();
  expect((await readPublic(db))[0]?.published.tags).toEqual([]);
  expect(await readPublic(db, undefined, { tag: 'private' })).toEqual([]);
});
