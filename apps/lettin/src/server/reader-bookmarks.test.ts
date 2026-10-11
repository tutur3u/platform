import { readFile } from 'node:fs/promises';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Store } from './context';
import {
  notebookSaved,
  savedNotebooks,
  setNotebookSaved,
} from './reader-bookmarks';

let mf: Miniflare, db: Store;
const worldId = '00000000-0000-4000-8000-000000000001';
const published = {
  title: 'Published',
  description: 'Public summary',
  image: 'https://example.test/public.png',
  credit: 'Artist',
  content: {
    type: 'doc',
    content: [{ type: 'text', text: 'Public document' }],
  },
  gallery: [{ image: 'https://example.test/gallery.png' }],
  links: ['hidden-id'],
  privateField: 'excluded',
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
    '0005_reader_bookmarks.sql',
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
    ['reader_bookmarks', 'worlds'].map((t) => db.prepare(`DELETE FROM ${t}`))
  );
  await db
    .prepare(
      'INSERT INTO worlds(id,ws_id,owner_id,draft,published) VALUES (?,?,?,?,?)'
    )
    .bind(
      worldId,
      'workspace',
      'creator',
      JSON.stringify({ ...published, title: 'Private draft' }),
      JSON.stringify(published)
    )
    .run();
});
it('saves idempotently without creator approval and isolates actors', async () => {
  expect(
    await Promise.all([
      setNotebookSaved(db, 'reader-a', worldId, true),
      setNotebookSaved(db, 'reader-a', worldId, true),
    ])
  ).toEqual([{ saved: true }, { saved: true }]);
  expect(await notebookSaved(db, 'reader-a', worldId)).toEqual({ saved: true });
  expect(await notebookSaved(db, 'reader-b', worldId)).toEqual({
    saved: false,
  });
  expect(await savedNotebooks(db, 'reader-b')).toEqual([]);
  const rows = await db.prepare('SELECT * FROM reader_bookmarks').all();
  expect(rows.results).toHaveLength(1);
  expect(Object.keys(rows.results[0]!)).toEqual([
    'user_id',
    'world_id',
    'created_at',
  ]);
});
it('projects only currently published card fields, never private drafts or documents', async () => {
  await setNotebookSaved(db, 'reader-a', worldId, true);
  expect((await savedNotebooks(db, 'reader-a'))[0]!.notebook).toEqual({
    title: 'Published',
    description: 'Public summary',
    image: 'https://example.test/public.png',
    credit: 'Artist',
  });
  await db
    .prepare('UPDATE worlds SET draft=? WHERE id=?')
    .bind(
      JSON.stringify({
        ...published,
        title: 'Secret revision',
        description: 'Private summary',
      }),
      worldId
    )
    .run();
  expect((await savedNotebooks(db, 'reader-a'))[0]!.notebook!.title).toBe(
    'Published'
  );
});
it('hides all source metadata after unpublishing while permitting private removal', async () => {
  await setNotebookSaved(db, 'reader-a', worldId, true);
  await db
    .prepare('UPDATE worlds SET published=NULL WHERE id=?')
    .bind(worldId)
    .run();
  const rows = await savedNotebooks(db, 'reader-a');
  expect(rows[0]).toMatchObject({ worldId, notebook: null });
  expect(JSON.stringify(rows)).not.toContain('Public summary');
  expect(await setNotebookSaved(db, 'reader-a', worldId, false)).toEqual({
    saved: false,
  });
  expect(await setNotebookSaved(db, 'reader-a', worldId, false)).toEqual({
    saved: false,
  });
});
it('rejects new saves for unpublished or missing sources', async () => {
  await db
    .prepare('UPDATE worlds SET published=NULL WHERE id=?')
    .bind(worldId)
    .run();
  await expect(
    setNotebookSaved(db, 'reader-a', worldId, true)
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    setNotebookSaved(db, 'reader-a', 'missing', true)
  ).rejects.toMatchObject({ status: 404 });
  expect(await savedNotebooks(db, 'reader-a')).toEqual([]);
});
it('cannot remove another actor save', async () => {
  await setNotebookSaved(db, 'reader-a', worldId, true);
  await setNotebookSaved(db, 'reader-b', worldId, false);
  expect(await notebookSaved(db, 'reader-a', worldId)).toEqual({ saved: true });
});
it('cascades references when the source is deleted', async () => {
  await setNotebookSaved(db, 'reader-a', worldId, true);
  await db.prepare('DELETE FROM worlds WHERE id=?').bind(worldId).run();
  expect(
    (await db.prepare('SELECT * FROM reader_bookmarks').all()).results
  ).toEqual([]);
});
it('enforces actor quota atomically while retaining idempotence at the limit', async () => {
  await db
    .prepare(`WITH RECURSIVE ids(n) AS (SELECT 2 UNION ALL SELECT n+1 FROM ids WHERE n<501)
 INSERT INTO worlds(id,ws_id,owner_id,draft,published) SELECT printf('00000000-0000-4000-8000-%012d',n),'workspace','creator',?,? FROM ids`)
    .bind(JSON.stringify(published), JSON.stringify(published))
    .run();
  await db
    .prepare(
      'INSERT INTO reader_bookmarks(user_id,world_id) SELECT ?,id FROM worlds WHERE id<>?'
    )
    .bind('reader-a', worldId)
    .run();
  await expect(
    setNotebookSaved(db, 'reader-a', worldId, true)
  ).rejects.toMatchObject({ status: 429 });
  expect(
    await setNotebookSaved(
      db,
      'reader-a',
      '00000000-0000-4000-8000-000000000002',
      true
    )
  ).toEqual({ saved: true });
  expect(await setNotebookSaved(db, 'reader-b', worldId, true)).toEqual({
    saved: true,
  });
  await setNotebookSaved(
    db,
    'reader-a',
    '00000000-0000-4000-8000-000000000002',
    false
  );
  await setNotebookSaved(db, 'reader-a', worldId, true);
  expect(await savedNotebooks(db, 'reader-a')).toHaveLength(500);
});
