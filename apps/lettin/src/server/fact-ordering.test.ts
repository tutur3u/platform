import { readFile } from 'node:fs/promises';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createStarterDraft } from '../components/starter-drafts';
import { wikiOf } from '../components/wiki-model';
import type { Actor, Store } from './context';
import { mutate } from './mutations';
import { readPublic, readWorld } from './queries';

const draft = createStarterDraft('Notebook', 'blank', (key) => key);
let mf: Miniflare;
let db: Store;
let worldId: string;
const owner: Actor = {
  id: 'owner',
  wsId: 'workspace',
  isAdmin: true,
  canManage: true,
  verifiedEmail: async () => null,
  eligibleMember: async () => true,
  memberNames: async () => [],
};
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
it('keeps reordered character facts private until explicit republishing and rejects stale writes', async () => {
  const facts = [
    { label: 'Name', value: 'Ada' },
    { label: 'Role', value: 'Explorer' },
  ];
  const entryDraft = {
    ...draft,
    title: 'Character',
    kind: 'character' as const,
    wiki: { ...wikiOf(draft), aliases: ['Alias'], facts },
  };
  const entryId = (
    await mutate(db, owner, {
      action: 'createEntry',
      worldId,
      draft: entryDraft,
    })
  ).id;
  await mutate(db, owner, { action: 'publishWorld', worldId, version: 1 });
  await mutate(db, owner, {
    action: 'publishEntry',
    worldId,
    entryId,
    version: 1,
  });
  const reordered = {
    ...entryDraft,
    wiki: { ...entryDraft.wiki, facts: [...facts].reverse() },
  };
  await mutate(db, owner, {
    action: 'saveEntry',
    worldId,
    entryId,
    version: 2,
    draft: reordered,
  });
  expect((await readWorld(db, owner, worldId)).entries[0]!.draft.wiki).toEqual(
    reordered.wiki
  );
  expect(
    (await readPublic(db, worldId))[0]!.entries[0]!.published.wiki
  ).toEqual(entryDraft.wiki);
  await expect(
    mutate(db, owner, {
      action: 'saveEntry',
      worldId,
      entryId,
      version: 2,
      draft: entryDraft,
    })
  ).rejects.toMatchObject({ status: 409 });
  await mutate(db, owner, {
    action: 'publishEntry',
    worldId,
    entryId,
    version: 3,
  });
  expect(
    (await readPublic(db, worldId))[0]!.entries[0]!.published.wiki
  ).toEqual(reordered.wiki);
  expect(facts.map((fact) => fact.label)).toEqual(['Name', 'Role']);
});
