import { readFile } from 'node:fs/promises';
import type { LettinDraft } from '@tuturuuu/internal-api/lettin';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Actor, Store } from './context';
import { exportNotebook } from './notebook-export';

let mf: Miniflare, db: Store;
const worldId = '00000000-0000-4000-8000-000000000001',
  publicId = '00000000-0000-4000-8000-000000000002',
  privateId = '00000000-0000-4000-8000-000000000003';
const owner: Actor = {
  id: 'owner',
  wsId: 'workspace',
  isAdmin: true,
  canManage: true,
  verifiedEmail: async () => null,
  eligibleMember: async () => true,
  memberNames: async () => [],
};
const editor: Actor = { ...owner, id: 'editor', isAdmin: false };
const draft: LettinDraft = {
  title: 'Private draft',
  description: 'Private description',
  image: '',
  credit: 'Artist',
  kind: 'page',
  tags: [],
  links: [],
  content: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Private text' }] },
    ],
  },
};
const published = {
  ...draft,
  title: 'Published title',
  description: 'Public summary',
  links: [privateId, publicId],
  wiki: {
    aliases: [],
    facts: [],
    relationships: [
      { targetId: privateId, kind: 'related' },
      { targetId: publicId, kind: 'related' },
    ],
  },
  content: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Public text' }] },
    ],
  },
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
  await db
    .prepare(
      'INSERT INTO worlds(id,ws_id,owner_id,draft,published) VALUES (?,?,?,?,?)'
    )
    .bind(
      worldId,
      owner.wsId,
      owner.id,
      JSON.stringify({ ...draft, actorSecret: 'must omit' }),
      JSON.stringify(published)
    )
    .run();
  await db
    .prepare('INSERT INTO creators(user_id) VALUES (?)')
    .bind(editor.id)
    .run();
  await db
    .prepare(
      'INSERT INTO collaborators(ws_id,world_id,user_id,role) VALUES (?,?,?,?)'
    )
    .bind(owner.wsId, worldId, editor.id, 'editor')
    .run();
  for (const [id, pub] of [
    [
      publicId,
      JSON.stringify({
        ...draft,
        title: 'Public entry',
        description: 'Public entry summary',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Public entry text' }],
            },
          ],
        },
        links: [privateId],
      }),
    ],
    [privateId, null],
  ])
    await db
      .prepare(
        'INSERT INTO entries(id,ws_id,world_id,draft,published) VALUES (?,?,?,?,?)'
      )
      .bind(id, owner.wsId, worldId, JSON.stringify(draft), pub)
      .run();
});
it('exports only published documents and filters references to excluded entries', async () => {
  const result = await exportNotebook(db, editor, worldId, 'published', false);
  expect(result).toMatchObject({
    format: 'lettin-notebook',
    version: 1,
    scope: 'published',
    world: {
      id: worldId,
      document: {
        title: 'Published title',
        links: [publicId],
        wiki: {
          relationships: [expect.objectContaining({ targetId: publicId })],
        },
      },
    },
  });
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0]!.document.links).toEqual([]);
  expect(JSON.stringify(result)).not.toContain('Private text');
  expect(JSON.stringify(result)).not.toContain(privateId);
  expect(result).not.toHaveProperty('collaborators');
  expect(result).not.toHaveProperty('owner_id');
});
it('requires both ownership and explicit confirmation for saved draft export', async () => {
  await expect(
    exportNotebook(db, owner, worldId, 'draft', false)
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    exportNotebook(db, editor, worldId, 'draft', true)
  ).rejects.toMatchObject({ status: 403 });
  const result = await exportNotebook(db, owner, worldId, 'draft', true);
  expect(result.entries).toHaveLength(2);
  expect(result.world.document.title).toBe('Private draft');
  expect(JSON.stringify(result)).not.toContain('actorSecret');
  expect(JSON.stringify(result)).not.toContain('must omit');
});
it('rejects other workspaces and actors with no notebook grant', async () => {
  await expect(
    exportNotebook(db, { ...owner, wsId: 'other' }, worldId, 'published', false)
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    exportNotebook(
      db,
      { ...editor, id: 'unrelated' },
      worldId,
      'published',
      false
    )
  ).rejects.toMatchObject({ status: 403 });
});
it('rejects unpublished mode sources but permits consented owner drafts without mutating originals', async () => {
  await db
    .prepare('UPDATE worlds SET published=NULL WHERE id=?')
    .bind(worldId)
    .run();
  const before = await db
    .prepare('SELECT * FROM worlds WHERE id=?')
    .bind(worldId)
    .first();
  await expect(
    exportNotebook(db, owner, worldId, 'published', false)
  ).rejects.toMatchObject({ status: 404 });
  await exportNotebook(db, owner, worldId, 'draft', true);
  expect(
    await db.prepare('SELECT * FROM worlds WHERE id=?').bind(worldId).first()
  ).toEqual(before);
});
function afterEntries(effect: () => Promise<unknown>): Store {
  return {
    batch: db.batch.bind(db),
    prepare(sql) {
      const target = db.prepare(sql);
      if (!sql.startsWith('SELECT id,')) return target;
      return new Proxy(target, {
        get(target, key) {
          if (key === 'bind')
            return (...args: unknown[]) => {
              const bound = target.bind(...args);
              return new Proxy(bound, {
                get(inner, method) {
                  if (method === 'all')
                    return async () => {
                      const result = await inner.all();
                      await effect();
                      return result;
                    };
                  const value = Reflect.get(inner, method);
                  return typeof value === 'function'
                    ? value.bind(inner)
                    : value;
                },
              });
            };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
}
it('rechecks creator and collaborator revocation before releasing the file', async () => {
  const wrapped = afterEntries(() =>
    db.prepare('DELETE FROM collaborators').run()
  );
  await expect(
    exportNotebook(wrapped, editor, worldId, 'published', false)
  ).rejects.toMatchObject({ status: 403 });
});
it('suppresses exports if source entries are unpublished while being read', async () => {
  const wrapped = afterEntries(() =>
    db
      .prepare('UPDATE entries SET published=NULL WHERE id=?')
      .bind(publicId)
      .run()
  );
  await expect(
    exportNotebook(wrapped, owner, worldId, 'published', false)
  ).rejects.toMatchObject({ status: 409 });
});
it('rejects invalid saved content and never exports executable document nodes', async () => {
  await db
    .prepare('UPDATE worlds SET draft=? WHERE id=?')
    .bind(JSON.stringify({ ...draft, content: { type: 'script' } }), worldId)
    .run();
  await expect(
    exportNotebook(db, owner, worldId, 'draft', true)
  ).rejects.toMatchObject({ status: 422 });
});
it('bounds source count before reading entry documents', async () => {
  await db
    .prepare(`WITH RECURSIVE ids(n) AS (SELECT 10 UNION ALL SELECT n+1 FROM ids WHERE n<1010)
 INSERT INTO entries(id,ws_id,world_id,draft) SELECT printf('00000000-0000-4000-8000-%012d',n),?,?,? FROM ids`)
    .bind(owner.wsId, worldId, JSON.stringify(draft))
    .run();
  await expect(
    exportNotebook(db, owner, worldId, 'draft', true)
  ).rejects.toMatchObject({ status: 413 });
});
it('bounds encoded aggregate bytes before the entry read', async () => {
  await db
    .prepare(`WITH RECURSIVE ids(n) AS (SELECT 10 UNION ALL SELECT n+1 FROM ids WHERE n<39)
    INSERT INTO entries(id,ws_id,world_id,draft) SELECT printf('00000000-0000-4000-8000-%012d',n),?,?,? FROM ids`)
    .bind(
      owner.wsId,
      worldId,
      JSON.stringify({ ...draft, description: 'x'.repeat(400000) })
    )
    .run();
  const wrapped: Store = {
    batch: db.batch.bind(db),
    prepare(sql) {
      if (sql.startsWith('SELECT id,'))
        throw new Error('Entry read should be blocked');
      return db.prepare(sql);
    },
  };
  await expect(
    exportNotebook(wrapped, owner, worldId, 'draft', true)
  ).rejects.toMatchObject({ status: 413 });
});

it('rejects excessive saved document depth before recursive schema validation', async () => {
  let content: { type: string; content?: unknown[] } = { type: 'paragraph' };
  for (let i = 0; i < 30; i++)
    content = { type: 'blockquote', content: [content] };
  await db
    .prepare('UPDATE worlds SET draft=? WHERE id=?')
    .bind(
      JSON.stringify({
        ...draft,
        content: { type: 'doc', content: [content] },
      }),
      worldId
    )
    .run();
  await expect(
    exportNotebook(db, owner, worldId, 'draft', true)
  ).rejects.toMatchObject({ status: 422 });
});
