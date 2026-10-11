import { readFile } from 'node:fs/promises';
import type { LettinDraft } from '@tuturuuu/internal-api/lettin';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Actor, Store } from './context';
import { mutate } from './mutations';
import { readPublic, readWorld } from './queries';
import { lettinCommandSchema } from './schema';

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
  title: 'Character',
  kind: 'character',
  description: '',
  image: '',
  credit: 'Artist',
  tags: ['canon'],
  links: [],
  wiki: {
    aliases: ['Alias'],
    facts: [{ label: 'Context', value: 'Original context' }],
    relationships: [],
  },
  gallery: [
    {
      image: 'https://example.com/art.png',
      alt: 'Portrait',
      caption: 'Artwork',
      credit: 'Artist',
    },
  ],
  content: { type: 'doc', content: [] },
};
let mf: Miniflare;
let db: Store;
let worldId: string;
let entryId: string;
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: '2026-09-14',
      d1Databases: ['DB'],
    })
  );
  db = await mf.getD1Database('DB');
  for (const file of [
    '0001_worldbuilding.sql',
    '0002_public_indexes.sql',
    '0003_media_cleanup.sql',
    '0004_creator_imports_and_moderation.sql',
  ]) {
    const sql = await readFile(
      new URL(`../../migrations/${file}`, import.meta.url),
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
    ['entries', 'collaborators', 'worlds', 'creators'].map((table) =>
      db.prepare(`DELETE FROM ${table}`)
    )
  );
  worldId = (await mutate(db, owner, { action: 'createWorld', draft })).id;
  entryId = (await mutate(db, owner, { action: 'createEntry', worldId, draft }))
    .id;
});
const command = (version = 1) => ({
  action: 'duplicateEntry' as const,
  worldId,
  entryId,
  version,
  title: 'Variant',
  contextFact: { label: ' Context ', value: ' Alternate era ' },
});
it('appends one context fact to a private copy and preserves the published source and artwork', async () => {
  await mutate(db, owner, {
    action: 'publishEntry',
    worldId,
    entryId,
    version: 1,
  });
  await mutate(db, owner, { action: 'publishWorld', worldId, version: 1 });
  const before = (await readWorld(db, owner, worldId)).entries[0]!;
  const publicBefore = await readPublic(db, worldId);
  expect(publicBefore).toHaveLength(1);
  expect(publicBefore[0]!.entries).toHaveLength(1);
  expect(publicBefore[0]!.entries[0]!.published.wiki?.facts).toEqual(
    draft.wiki!.facts
  );
  const result = await mutate(db, owner, { ...command(2), linkSource: true });
  const records = (await readWorld(db, owner, worldId)).entries;
  const copy = records.find((entry) => entry.id === result.id)!;
  expect(copy).toMatchObject({
    version: 1,
    published: null,
    published_at: null,
    draft: {
      title: 'Variant',
      gallery: draft.gallery,
      tags: draft.tags,
      credit: draft.credit,
      links: [entryId],
      wiki: {
        aliases: ['Alias'],
        facts: [
          ...draft.wiki!.facts,
          { label: 'Context', value: 'Alternate era' },
        ],
        relationships: [],
      },
    },
  });
  expect(records.find((entry) => entry.id === entryId)).toEqual(before);
  expect(await readPublic(db, worldId)).toEqual(publicBefore);
});
it('retains revision, workspace and actor fences for context copies', async () => {
  await expect(mutate(db, owner, command(2))).rejects.toMatchObject({
    status: 409,
  });
  await expect(
    mutate(db, { ...owner, wsId: 'other' }, command())
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    mutate(db, { ...owner, id: 'outsider', isAdmin: false }, command())
  ).rejects.toMatchObject({ status: 403 });
  expect((await readWorld(db, owner, worldId)).entries).toHaveLength(1);
});
it('rejects non-character contexts and exceeding the existing fact limit without creating a copy', async () => {
  await mutate(db, owner, {
    action: 'saveEntry',
    worldId,
    entryId,
    version: 1,
    draft: { ...draft, kind: 'page' },
  });
  await expect(mutate(db, owner, command(2))).rejects.toMatchObject({
    status: 400,
  });
  await mutate(db, owner, {
    action: 'saveEntry',
    worldId,
    entryId,
    version: 2,
    draft: {
      ...draft,
      wiki: {
        ...draft.wiki!,
        facts: Array.from({ length: 40 }, (_, index) => ({
          label: String(index),
          value: '',
        })),
      },
    },
  });
  await expect(mutate(db, owner, command(3))).rejects.toMatchObject({
    status: 400,
  });
  const normal = await mutate(db, owner, {
    action: 'duplicateEntry',
    worldId,
    entryId,
    version: 3,
    title: 'Normal copy',
  });
  expect(
    (await readWorld(db, owner, worldId)).entries.find(
      (entry) => entry.id === normal.id
    )?.draft.wiki?.facts
  ).toHaveLength(40);
});
it('validates explicit bounded context values and preserves the legacy optional default', () => {
  const value = command();
  expect(lettinCommandSchema.parse(value)).toMatchObject({
    contextFact: {
      label: 'Context',
      value: 'Alternate era',
    },
  });
  for (const contextFact of [
    { label: '', value: 'Value' },
    { label: 'Context', value: '  ' },
    { label: 'x'.repeat(81), value: 'Value' },
    { label: 'Context', value: 'x'.repeat(1001) },
  ])
    expect(
      lettinCommandSchema.safeParse({ ...value, contextFact }).success
    ).toBe(false);
  const { contextFact: _context, ...legacy } = value;
  expect(lettinCommandSchema.parse(legacy)).not.toHaveProperty('contextFact');
});

it('adds an explicit context to legacy character drafts without wiki metadata', async () => {
  await mutate(db, owner, {
    action: 'saveEntry',
    worldId,
    entryId,
    version: 1,
    draft: { ...draft, wiki: undefined },
  });
  const result = await mutate(db, owner, command(2));
  const copied = (await readWorld(db, owner, worldId)).entries.find(
    (entry) => entry.id === result.id
  )!;
  expect(copied.draft.wiki).toEqual({
    aliases: [],
    relationships: [],
    facts: [{ label: 'Context', value: 'Alternate era' }],
  });
  expect(copied.published).toBeNull();
});
