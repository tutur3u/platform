import { readFile } from 'node:fs/promises';
import type { LettinDraft } from '@tuturuuu/internal-api/lettin';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Actor, Store } from './context';
import { mutate } from './mutations';
import { readPublic, readWorld } from './queries';
import { lettinDraftSchema } from './schema';

const draft: LettinDraft = {
  title: 'Notebook',
  description: '',
  image: '',
  credit: '',
  kind: 'page',
  tags: [],
  links: [],
  content: { type: 'doc', content: [] },
};
const owner: Actor = {
  id: 'owner',
  wsId: 'workspace',
  isAdmin: true,
  canManage: true,
  verifiedEmail: async () => null,
  eligibleMember: async () => true,
  memberNames: async () => [],
};
let mf: Miniflare;
let db: Store;
let worldId: string;
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
    ['entries', 'collaborators', 'worlds', 'creators'].map((t) =>
      db.prepare(`DELETE FROM ${t}`)
    )
  );
  worldId = (await mutate(db, owner, { action: 'createWorld', draft })).id;
});
it('validates explicit labels and preserves historical absence', () => {
  expect(lettinDraftSchema.parse(draft).workProgress).toBeUndefined();
  for (const workProgress of ['unstarted', 'drafting', 'revising', 'ready'])
    expect(
      lettinDraftSchema.parse({ ...draft, workProgress }).workProgress
    ).toBe(workProgress);
  expect(
    lettinDraftSchema.safeParse({ ...draft, workProgress: 'published' }).success
  ).toBe(false);
});
it('keeps world and entry labels private through publishing, later edits and copies', async () => {
  await mutate(db, owner, {
    action: 'saveWorld',
    worldId,
    version: 1,
    draft: { ...draft, workProgress: 'ready' },
  });
  const entryId = (
    await mutate(db, owner, {
      action: 'createEntry',
      worldId,
      draft: { ...draft, workProgress: 'drafting' },
    })
  ).id;
  expect(await readPublic(db, worldId)).toEqual([]);
  await mutate(db, owner, {
    action: 'publishEntry',
    worldId,
    entryId,
    version: 1,
  });
  await mutate(db, owner, { action: 'publishWorld', worldId, version: 2 });
  const published = (await readPublic(db, worldId))[0]!;
  expect(published.published).not.toHaveProperty('workProgress');
  expect(published.entries[0]!.published).not.toHaveProperty('workProgress');
  expect((await readPublic(db))[0]!.published).not.toHaveProperty(
    'workProgress'
  );
  const privateView = await readWorld(db, owner, worldId);
  expect(privateView.world.draft.workProgress).toBe('ready');
  expect(privateView.entries[0]!.draft.workProgress).toBe('drafting');
  const stored = await db
    .prepare('SELECT published FROM entries WHERE id=?')
    .bind(entryId)
    .first<{ published: string }>();
  expect(JSON.parse(stored!.published)).not.toHaveProperty('workProgress');
  await mutate(db, owner, {
    action: 'saveEntry',
    worldId,
    entryId,
    version: 2,
    draft: { ...draft, workProgress: 'revising' },
  });
  expect(
    (await readPublic(db, worldId))[0]!.entries[0]!.published
  ).not.toHaveProperty('workProgress');
  const copyId = (
    await mutate(db, owner, {
      action: 'duplicateEntry',
      worldId,
      entryId,
      version: 3,
      title: 'Private copy',
    })
  ).id;
  expect(
    (await readWorld(db, owner, worldId)).entries.find((e) => e.id === copyId)
  ).toMatchObject({ published: null, draft: { workProgress: 'revising' } });
});
it('sanitizes historical published world and entry JSON without modifying saved drafts', async () => {
  const entryId = (
    await mutate(db, owner, {
      action: 'createEntry',
      worldId,
      draft: { ...draft, workProgress: 'ready' },
    })
  ).id;
  await db.batch([
    db
      .prepare('UPDATE worlds SET published=?,published_at=? WHERE id=?')
      .bind(
        JSON.stringify({ ...draft, workProgress: 'revising' }),
        '2026-10-09',
        worldId
      ),
    db
      .prepare('UPDATE entries SET published=?,published_at=? WHERE id=?')
      .bind(
        JSON.stringify({ ...draft, workProgress: 'ready' }),
        '2026-10-09',
        entryId
      ),
  ]);
  const world = (await readPublic(db, worldId))[0]!;
  expect(world.published).not.toHaveProperty('workProgress');
  expect(world.entries[0]!.published).not.toHaveProperty('workProgress');
  expect((await readPublic(db))[0]!.published).not.toHaveProperty(
    'workProgress'
  );
  expect(
    (await readWorld(db, owner, worldId)).entries[0]!.draft.workProgress
  ).toBe('ready');
});
it('uses existing collaborator, workspace and revision fences rather than label-based grants', async () => {
  const outsider = { ...owner, id: 'outsider', isAdmin: false };
  const command = {
    action: 'saveWorld' as const,
    worldId,
    version: 1,
    draft: { ...draft, workProgress: 'ready' as const },
  };
  await expect(mutate(db, outsider, command)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    mutate(db, { ...owner, wsId: 'elsewhere' }, command)
  ).rejects.toMatchObject({ status: 403 });
  await db
    .prepare('INSERT INTO creators(user_id) VALUES (?)')
    .bind(outsider.id)
    .run();
  await mutate(db, owner, {
    action: 'setCollaborator',
    worldId,
    userId: outsider.id,
    role: 'editor',
  });
  await mutate(db, outsider, command);
  expect(
    (await readWorld(db, outsider, worldId)).world.draft.workProgress
  ).toBe('ready');
  await expect(
    mutate(db, outsider, { action: 'publishWorld', worldId, version: 2 })
  ).rejects.toMatchObject({ status: 403 });
  await expect(mutate(db, owner, command)).rejects.toMatchObject({
    status: 409,
  });
  await mutate(db, owner, {
    action: 'removeCollaborator',
    worldId,
    userId: outsider.id,
  });
  await expect(readWorld(db, outsider, worldId)).rejects.toMatchObject({
    status: 403,
  });
});
