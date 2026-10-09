import { readFile } from 'node:fs/promises';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Actor, Store } from './context';
import { previewImport } from './import-store';
import {
  applyNotebookImport,
  buildNotebookImportPlan,
  requireNotebookImportAccess,
} from './notebook-import';
import { lettinDraftSchema } from './schema';

const worldId = '00000000-0000-4000-8000-000000000001',
  entryId = '00000000-0000-4000-8000-000000000002',
  missingId = '00000000-0000-4000-8000-000000000003';
const document = {
  contentNotice: 'Source notice',
  creationGuidance: {
    credits: 'Source author',
    usageNotes: 'Ask before reuse',
    collaboration: 'ask-first',
  },
  title: 'Source',
  description: 'Saved text',
  image: '/api/v1/lettin/media/00000000-0000-4000-8000-000000000004',
  credit: 'Artist',
  kind: 'page',
  tags: ['story'],
  links: [entryId, missingId],
  wiki: {
    aliases: [],
    facts: [],
    relationships: [
      { targetId: entryId, kind: 'related' },
      { targetId: missingId, kind: 'related' },
    ],
  },
  content: {
    type: 'doc',
    content: [
      {
        type: 'image',
        attrs: { src: 'https://example.com/art.png', alt: 'Art description' },
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Reference text',
            marks: [
              { type: 'link', attrs: { href: 'https://example.com/private' } },
            ],
          },
        ],
      },
    ],
  },
};
const payload = () => ({
  format: 'lettin-notebook',
  version: 1,
  scope: 'draft',
  exportedAt: '2026-10-09T00:00:00.000Z',
  world: { id: worldId, document: { ...document, owner_id: 'ignored' } },
  entries: [{ id: entryId, document }],
});
it('remaps only included structured links and retains safe text, credits and provenance', () => {
  const result = buildNotebookImportPlan(payload(), ' New copy ');
  expect(result.world.title).toBe('New copy');
  expect(result.entries[0]!.id).not.toBe(entryId);
  expect(result.world.links).toEqual([result.entries[0]!.id]);
  expect(result.world.wiki!.relationships[0]!.targetId).toBe(
    result.entries[0]!.id
  );
  expect(result.world.wiki!.relationships).toHaveLength(1);
  expect(result.world.credit).toBe('Artist');
  expect(result.world.contentNotice).toBe(document.contentNotice);
  expect(result.world.creationGuidance).toEqual(document.creationGuidance);
  expect(result.entries[0]!.draft.creationGuidance).toEqual(
    document.creationGuidance
  );
  expect(JSON.stringify(result.world)).not.toContain('owner_id');
  expect(result.provenance).toEqual({
    worldId,
    scope: 'draft',
    exportedAt: '2026-10-09T00:00:00.000Z',
  });
  expect(result.blacklist).toEqual([]);
});
it('removes remote and managed images and hyperlink targets without fetching them', () => {
  const result = buildNotebookImportPlan(payload(), 'Copy');
  const text = JSON.stringify(result.world);
  expect(result.world.image).toBe('');
  expect(text).not.toContain('https://');
  expect(text).not.toContain('/api/');
  expect(text).toContain('Art description');
  expect(text).toContain('Reference text');
  expect(lettinDraftSchema.safeParse(result.world).success).toBe(true);
});
it.each([2, 0])('rejects unsupported format version %s', (version) => {
  expect(() =>
    buildNotebookImportPlan({ ...payload(), version }, 'Copy')
  ).toThrow();
});
it('rejects duplicate IDs, notebook/entry collisions, oversized counts and executable nodes', () => {
  const p = payload();
  expect(() =>
    buildNotebookImportPlan(
      { ...p, entries: [...p.entries, ...p.entries] },
      'Copy'
    )
  ).toThrow();
  expect(() =>
    buildNotebookImportPlan(
      { ...p, entries: [{ ...p.entries[0], id: worldId }] },
      'Copy'
    )
  ).toThrow();
  expect(() =>
    buildNotebookImportPlan(
      { ...p, entries: Array(1001).fill(p.entries[0]) },
      'Copy'
    )
  ).toThrow();
  expect(() =>
    buildNotebookImportPlan(
      {
        ...p,
        world: {
          id: worldId,
          document: { ...document, content: { type: 'script' } },
        },
      },
      'Copy'
    )
  ).toThrow();
});
it('rejects deep content and blank titles before creating a plan', () => {
  let nested: unknown = {};
  for (let i = 0; i < 30; i++) nested = { nested };
  expect(() => buildNotebookImportPlan(nested, 'Copy')).toThrow();
  expect(() => buildNotebookImportPlan(payload(), ' ')).toThrow();
});
let mf: Miniflare, db: Store;
const actor: Actor = {
  id: 'creator',
  wsId: 'destination',
  isAdmin: false,
  canManage: true,
  verifiedEmail: async () => null,
  eligibleMember: async () => true,
  memberNames: async () => [],
};
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
    ['entries', 'collaborators', 'worlds', 'import_previews', 'creators'].map(
      (table) => db.prepare(`DELETE FROM ${table}`)
    )
  );
  await db
    .prepare('INSERT INTO creators(user_id) VALUES (?)')
    .bind(actor.id)
    .run();
});
it('atomically creates private drafts with new ownership and idempotent apply', async () => {
  const plan = buildNotebookImportPlan(payload(), 'Copy');
  const preview = await previewImport(db, actor, plan);
  const result = await applyNotebookImport(db, actor, preview.id);
  expect(result.id).not.toBe(worldId);
  expect(await applyNotebookImport(db, actor, preview.id)).toEqual(result);
  const world = await db
    .prepare('SELECT owner_id,ws_id,published,version FROM worlds WHERE id=?')
    .bind(result.id)
    .first();
  expect(world).toEqual({
    owner_id: actor.id,
    ws_id: actor.wsId,
    published: null,
    version: 1,
  });
  const entries = await db
    .prepare('SELECT id,published,version FROM entries WHERE world_id=?')
    .bind(result.id)
    .all();
  expect(entries.results).toEqual([
    { id: plan.entries[0]!.id, published: null, version: 1 },
  ]);
  for (const table of ['collaborators', 'media', 'creator_blacklist'])
    expect(
      (await db.prepare(`SELECT count(*) AS n FROM ${table}`).first())!.n
    ).toBe(0);
});
it('fences another actor/workspace and previews from a different importer', async () => {
  const plan = buildNotebookImportPlan(payload(), 'Copy'),
    preview = await previewImport(db, actor, plan);
  await expect(
    applyNotebookImport(
      db,
      { ...actor, id: 'other', isAdmin: true },
      preview.id
    )
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    applyNotebookImport(db, { ...actor, wsId: 'other' }, preview.id)
  ).rejects.toMatchObject({ status: 404 });
  const legacy = await previewImport(db, actor, { ...plan, source: 'file' });
  await expect(applyNotebookImport(db, actor, legacy.id)).rejects.toMatchObject(
    { status: 404 }
  );
});
it('blocks revoked creator, missing workspace permission and expired previews', async () => {
  const preview = await previewImport(
    db,
    actor,
    buildNotebookImportPlan(payload(), 'Copy')
  );
  await expect(
    requireNotebookImportAccess(db, { ...actor, canManage: false })
  ).rejects.toMatchObject({ status: 403 });
  await db
    .prepare("UPDATE import_previews SET expires_at='2000-01-01' WHERE id=?")
    .bind(preview.id)
    .run();
  await expect(
    applyNotebookImport(db, actor, preview.id)
  ).rejects.toMatchObject({ status: 410 });
  await db.prepare('UPDATE creators SET enabled=0').run();
  await expect(
    applyNotebookImport(db, actor, preview.id)
  ).rejects.toMatchObject({ status: 403 });
  expect(await db.prepare('SELECT id FROM worlds').first()).toBeNull();
});

it('bounds both source file bytes and the single-row prepared preview', () => {
  expect(() =>
    buildNotebookImportPlan(
      { ...payload(), ignored: 'x'.repeat(10 * 1024 * 1024) },
      'Copy'
    )
  ).toThrow();
  const p = payload();
  const large = {
    ...document,
    content: {
      type: 'doc',
      content: Array.from({ length: 100 }, () => ({
        type: 'paragraph',
        content: [{ type: 'text', text: 'x'.repeat(15000) }],
      })),
    },
  };
  expect(() =>
    buildNotebookImportPlan(
      { ...p, entries: [{ id: entryId, document: large }] },
      'Copy'
    )
  ).toThrow();
});
it('checks creator revocation inside the D1 transaction after initial access reads', async () => {
  const preview = await previewImport(
    db,
    actor,
    buildNotebookImportPlan(payload(), 'Copy')
  );
  const fenced: Store = {
    prepare: db.prepare.bind(db),
    batch: async (statements) => {
      await db.prepare('UPDATE creators SET enabled=0').run();
      return db.batch(statements);
    },
  };
  await expect(
    applyNotebookImport(fenced, actor, preview.id)
  ).rejects.toMatchObject({ status: 403 });
  expect(await db.prepare('SELECT id FROM worlds').first()).toBeNull();
  expect(await db.prepare('SELECT id FROM entries').first()).toBeNull();
});
