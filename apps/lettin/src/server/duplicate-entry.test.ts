import { readFile } from 'node:fs/promises';
import type { LettinDraft } from '@tuturuuu/internal-api/lettin';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Actor, Store } from './context';
import { mutate } from './mutations';
import { readPublic, readWorld } from './queries';
import { lettinCommandSchema } from './schema';

let mf: Miniflare;
let db: Store;
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
  title: 'Source',
  description: 'Description',
  image: '',
  credit: 'Author',
  kind: 'character',
  tags: ['tag'],
  links: [],
  wiki: {
    aliases: ['Alias'],
    facts: [{ label: 'Role', value: 'Pilot' }],
    relationships: [],
    chronology: { label: 'Year one', order: 1, era: 'Era' },
  },
  content: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Saved text' }] },
    ],
  },
};
let worldId: string;
let entryId: string;
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
    ['media', 'entries', 'collaborators', 'worlds', 'creators'].map((t) =>
      db.prepare(`DELETE FROM ${t}`)
    )
  );
  await db
    .prepare('INSERT INTO creators(user_id) VALUES (?)')
    .bind(editor.id)
    .run();
  worldId = (await mutate(db, owner, { action: 'createWorld', draft })).id;
  entryId = (await mutate(db, owner, { action: 'createEntry', worldId, draft }))
    .id;
  await mutate(db, owner, {
    action: 'setCollaborator',
    worldId,
    userId: editor.id,
    role: 'editor',
  });
});
function copy(actor = owner, version = 1, sourceWorld = worldId) {
  return mutate(db, actor, {
    action: 'duplicateEntry',
    worldId: sourceWorld,
    entryId,
    version,
    title: '  Copy  ',
  });
}
it('copies saved content while removing structured references and all publication state', async () => {
  const target = (
    await mutate(db, owner, { action: 'createEntry', worldId, draft })
  ).id;
  await mutate(db, owner, {
    action: 'saveEntry',
    worldId,
    entryId,
    version: 1,
    draft: {
      ...draft,
      links: [target],
      wiki: {
        ...draft.wiki!,
        relationships: [{ targetId: target, kind: 'related', label: 'Friend' }],
      },
    },
  });
  await mutate(db, owner, {
    action: 'publishEntry',
    worldId,
    entryId,
    version: 2,
  });
  await mutate(db, owner, { action: 'publishWorld', worldId, version: 1 });
  const before = await readWorld(db, owner, worldId);
  const result = await copy(owner, 3);
  const after = await readWorld(db, owner, worldId);
  const clone = after.entries.find((e) => e.id === result.id)!;
  expect(clone).toMatchObject({
    version: 1,
    published: null,
    published_at: null,
    draft: {
      ...draft,
      title: 'Copy',
      links: [],
      wiki: { ...draft.wiki, relationships: [] },
    },
  });
  expect(after.entries.find((e) => e.id === entryId)).toEqual(
    before.entries.find((e) => e.id === entryId)
  );
  expect(
    (await readPublic(db, worldId))[0]!.entries.map((e) => e.id)
  ).not.toContain(result.id);
});
it('allows editors to copy without granting publishing access', async () => {
  const result = await copy(editor);
  await expect(
    mutate(db, editor, {
      action: 'publishEntry',
      worldId,
      entryId: result.id,
      version: 1,
    })
  ).rejects.toMatchObject({ status: 403 });
});
it('rejects stale revisions without creating a row', async () => {
  await mutate(db, owner, {
    action: 'saveEntry',
    worldId,
    entryId,
    version: 1,
    draft: { ...draft, description: 'Changed' },
  });
  await expect(copy()).rejects.toMatchObject({ status: 409 });
  expect((await readWorld(db, owner, worldId)).entries).toHaveLength(1);
});
it('rejects another notebook source and workspace', async () => {
  const other = (await mutate(db, owner, { action: 'createWorld', draft })).id;
  await expect(copy(owner, 1, other)).rejects.toMatchObject({ status: 404 });
  await expect(copy({ ...owner, wsId: 'other' })).rejects.toMatchObject({
    status: 403,
  });
});
it('rejects revoked creators and collaborators', async () => {
  await db
    .prepare('UPDATE creators SET enabled=0 WHERE user_id=?')
    .bind(editor.id)
    .run();
  await expect(copy(editor)).rejects.toMatchObject({ status: 403 });
  await db
    .prepare('UPDATE creators SET enabled=1 WHERE user_id=?')
    .bind(editor.id)
    .run();
  await db.prepare('DELETE FROM collaborators').run();
  await expect(copy(editor)).rejects.toMatchObject({ status: 403 });
});
function beforeInsert(effect: () => Promise<unknown>): Store {
  return {
    batch: db.batch.bind(db),
    prepare(sql) {
      const statement = db.prepare(sql);
      if (!sql.startsWith('INSERT INTO entries')) return statement;
      return new Proxy(statement, {
        get(target, key) {
          if (key === 'bind')
            return (...args: unknown[]) => {
              const bound = target.bind(...args);
              return new Proxy(bound, {
                get(inner, method) {
                  if (method === 'first')
                    return async (
                      ...values: Parameters<typeof inner.first>
                    ) => {
                      await effect();
                      return inner.first(...values);
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
it('fences permission revocation between the source read and insert', async () => {
  const wrapped = beforeInsert(() =>
    db.prepare('DELETE FROM collaborators').run()
  );
  await expect(
    mutate(wrapped, editor, {
      action: 'duplicateEntry',
      worldId,
      entryId,
      version: 1,
      title: 'Copy',
    })
  ).rejects.toMatchObject({ status: 403 });
  expect((await readWorld(db, owner, worldId)).entries).toHaveLength(1);
});
it('fences source changes between the read and insert', async () => {
  const wrapped = beforeInsert(() =>
    db
      .prepare('UPDATE entries SET version=version+1 WHERE id=?')
      .bind(entryId)
      .run()
  );
  await expect(
    mutate(wrapped, owner, {
      action: 'duplicateEntry',
      worldId,
      entryId,
      version: 1,
      title: 'Copy',
    })
  ).rejects.toMatchObject({ status: 409 });
  expect((await readWorld(db, owner, worldId)).entries).toHaveLength(1);
});
it('rejects retired or foreign notebook artwork', async () => {
  const image = `/api/v1/lettin/media/${crypto.randomUUID()}`;
  await db
    .prepare('UPDATE entries SET draft=? WHERE id=?')
    .bind(JSON.stringify({ ...draft, image }), entryId)
    .run();
  await expect(copy()).rejects.toMatchObject({ status: 409 });
});
it.each(['', ' ', 'x'.repeat(161)])('bounds the new title %s', (title) => {
  expect(
    lettinCommandSchema.safeParse({
      action: 'duplicateEntry',
      worldId,
      entryId,
      version: 1,
      title,
    }).success
  ).toBe(false);
});
it('requires source identity and positive revision, strips client-supplied content', () => {
  const value = lettinCommandSchema.parse({
    action: 'duplicateEntry',
    worldId,
    entryId,
    version: 1,
    title: 'Copy',
    draft: { title: 'Injected' },
  });
  expect(value).not.toHaveProperty('draft');
  expect(lettinCommandSchema.safeParse({ ...value, version: 0 }).success).toBe(
    false
  );
  expect(
    lettinCommandSchema.safeParse({ ...value, entryId: 'other' }).success
  ).toBe(false);
});

async function galleryMedia(world = worldId) {
  const id = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO media(id,ws_id,world_id,object_path,created_by) VALUES (?,?,?,?,?)'
    )
    .bind(id, owner.wsId, world, `fixture/${id}`, owner.id)
    .run();
  return {
    image: `/api/v1/lettin/media/${id}`,
    alt: 'Portrait',
    caption: 'Private caption',
    credit: 'Artist',
  };
}
it('copies saved gallery metadata and content notices into an unpublished draft', async () => {
  const gallery = [await galleryMedia()];
  await mutate(db, owner, {
    action: 'saveEntry',
    worldId,
    entryId,
    version: 1,
    draft: { ...draft, gallery, contentNotice: 'Reader guidance' },
  });
  const result = await copy(owner, 2);
  const clone = (await readWorld(db, owner, worldId)).entries.find(
    (e) => e.id === result.id
  )!;
  expect(clone).toMatchObject({
    version: 1,
    published: null,
    published_at: null,
    draft: { gallery, contentNotice: 'Reader guidance' },
  });
  expect(await readPublic(db, worldId)).toEqual([]);
});
it.each(['missing', 'foreign', 'retiring'])(
  'rejects %s gallery artwork when duplicating',
  async (state) => {
    const other = (await mutate(db, owner, { action: 'createWorld', draft }))
      .id;
    const item = await galleryMedia(state === 'foreign' ? other : worldId);
    const id = item.image.split('/').at(-1)!;
    if (state === 'missing')
      await db.prepare('DELETE FROM media WHERE id=?').bind(id).run();
    if (state === 'retiring')
      await db.prepare('UPDATE media SET deleting=1 WHERE id=?').bind(id).run();
    await db
      .prepare('UPDATE entries SET draft=? WHERE id=?')
      .bind(JSON.stringify({ ...draft, gallery: [item] }), entryId)
      .run();
    await expect(copy()).rejects.toMatchObject({ status: 409 });
    expect((await readWorld(db, owner, worldId)).entries).toHaveLength(1);
  }
);
it('fences gallery retirement between reading the source and inserting a copy', async () => {
  const item = await galleryMedia();
  await mutate(db, owner, {
    action: 'saveEntry',
    worldId,
    entryId,
    version: 1,
    draft: { ...draft, gallery: [item] },
  });
  const wrapped = beforeInsert(() =>
    db
      .prepare('UPDATE media SET deleting=1 WHERE id=?')
      .bind(item.image.split('/').at(-1)!)
      .run()
  );
  await expect(
    mutate(wrapped, owner, {
      action: 'duplicateEntry',
      worldId,
      entryId,
      version: 2,
      title: 'Copy',
    })
  ).rejects.toMatchObject({ status: 409 });
  expect((await readWorld(db, owner, worldId)).entries).toHaveLength(1);
});
