import { readFile } from 'node:fs/promises';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Store } from './context';
import {
  creatorSaved,
  savedCreators,
  setCreatorSaved,
} from './creator-bookmarks';

let mf: Miniflare, db: Store;
const creator = 'creator',
  world = 'world';
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
  for (const name of ['0001_worldbuilding.sql', '0006_creator_bookmarks.sql']) {
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
    ['creator_bookmarks', 'worlds'].map((t) => db.prepare(`DELETE FROM ${t}`))
  );
  await db
    .prepare(
      'INSERT INTO worlds(id,ws_id,owner_id,draft,published) VALUES (?,?,?,?,?)'
    )
    .bind(
      world,
      'workspace',
      creator,
      JSON.stringify({
        title: 'Private revision',
        bio: 'private',
        content: { type: 'doc' },
      }),
      JSON.stringify({
        title: 'Published title',
        bio: 'excluded',
        content: { type: 'doc' },
      })
    )
    .run();
});
it('retains actor-private references only after explicit saves with idempotent removal', async () => {
  expect(await creatorSaved(db, 'reader', creator)).toEqual({ saved: false });
  expect(await savedCreators(db, 'reader')).toEqual([]);
  await setCreatorSaved(db, 'reader', creator, true);
  await setCreatorSaved(db, 'reader', creator, true);
  expect(await creatorSaved(db, 'other', creator)).toEqual({ saved: false });
  expect(await savedCreators(db, 'other')).toEqual([]);
  expect(await savedCreators(db, 'reader')).toHaveLength(1);
  await setCreatorSaved(db, 'other', creator, false);
  expect(await creatorSaved(db, 'reader', creator)).toEqual({ saved: true });
  await setCreatorSaved(db, 'reader', creator, false);
  await setCreatorSaved(db, 'reader', creator, false);
  expect(await savedCreators(db, 'reader')).toEqual([]);
});
it('rejects unknown or unpublished creators without inserting references', async () => {
  await expect(
    setCreatorSaved(db, 'reader', 'unknown', true)
  ).rejects.toMatchObject({ status: 404 });
  await db
    .prepare('UPDATE worlds SET published=NULL WHERE id=?')
    .bind(world)
    .run();
  await expect(
    setCreatorSaved(db, 'reader', creator, true)
  ).rejects.toMatchObject({ status: 404 });
  expect(await savedCreators(db, 'reader')).toEqual([]);
});
it('projects only a current published notebook title and retains withdrawal as removable reference', async () => {
  await setCreatorSaved(db, 'reader', creator, true);
  const result = await savedCreators(db, 'reader');
  expect(result).toEqual([
    {
      creatorId: creator,
      savedAt: expect.any(String),
      notebookTitle: 'Published title',
    },
  ]);
  await db
    .prepare('UPDATE worlds SET published=NULL WHERE id=?')
    .bind(world)
    .run();
  expect((await savedCreators(db, 'reader'))[0]).toEqual({
    creatorId: creator,
    savedAt: expect.any(String),
    notebookTitle: null,
  });
  await setCreatorSaved(db, 'reader', creator, false);
  expect(await savedCreators(db, 'reader')).toEqual([]);
});
it('fences the 500-reference quota atomically and preserves existing saves at the limit', async () => {
  // Seed the same boundary in one SQL operation rather than 499 D1 statements.
  await db
    .prepare(`WITH RECURSIVE fixture(n) AS (
      SELECT 0 UNION ALL SELECT n+1 FROM fixture WHERE n<498
    ) INSERT INTO creator_bookmarks(user_id,creator_id)
      SELECT ?, 'fixture-' || n FROM fixture`)
    .bind('reader')
    .run();
  expect(
    await db
      .prepare(
        'SELECT count(*) AS count FROM creator_bookmarks WHERE user_id=?'
      )
      .bind('reader')
      .first<{ count: number }>()
  ).toEqual({ count: 499 });
  await db
    .prepare(
      'INSERT INTO worlds(id,ws_id,owner_id,draft,published) SELECT ?,ws_id,?,draft,published FROM worlds WHERE id=?'
    )
    .bind('second', 'creator-two', world)
    .run();
  const results = await Promise.allSettled([
    setCreatorSaved(db, 'reader', creator, true),
    setCreatorSaved(db, 'reader', 'creator-two', true),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((r) => r.status === 'rejected')).toMatchObject({
    reason: { status: 429 },
  });
  const count = await db
    .prepare('SELECT count(*) AS count FROM creator_bookmarks WHERE user_id=?')
    .bind('reader')
    .first<{ count: number }>();
  expect(count?.count).toBe(500);
  const existing = (await creatorSaved(db, 'reader', creator)).saved
    ? creator
    : 'creator-two';
  expect(await setCreatorSaved(db, 'reader', existing, true)).toEqual({
    saved: true,
  });
  expect(await setCreatorSaved(db, 'other', creator, true)).toEqual({
    saved: true,
  });
});
