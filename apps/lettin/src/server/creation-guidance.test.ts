import { readFile } from 'node:fs/promises';
import type { LettinCreationGuidance } from '@tuturuuu/internal-api/lettin';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createStarterDraft } from '../components/starter-drafts';
import type { Actor, Store } from './context';
import { mutate } from './mutations';
import { readPublic, readWorld } from './queries';
import { lettinDraftSchema } from './schema';

const draft = createStarterDraft('Creation', 'blank', (key) => key);
const guidance: LettinCreationGuidance = {
  credits: 'Writer and artist',
  usageNotes: 'Ask before sharing adaptations',
  collaboration: 'ask-first',
};
it('keeps historical drafts unspecified and bounds normalized creator-authored fields', () => {
  expect(lettinDraftSchema.parse(draft).creationGuidance).toBeUndefined();
  expect(
    lettinDraftSchema.parse({
      ...draft,
      creationGuidance: { ...guidance, credits: '  Artist  ' },
    }).creationGuidance?.credits
  ).toBe('Artist');
  for (const field of ['credits', 'usageNotes']) {
    expect(
      lettinDraftSchema.safeParse({
        ...draft,
        creationGuidance: { ...guidance, [field]: 'x'.repeat(1000) },
      }).success
    ).toBe(true);
    expect(
      lettinDraftSchema.safeParse({
        ...draft,
        creationGuidance: { ...guidance, [field]: 'x'.repeat(1001) },
      }).success
    ).toBe(false);
  }
  expect(
    lettinDraftSchema.safeParse({
      ...draft,
      creationGuidance: { ...guidance, collaboration: 'automatic-permission' },
    }).success
  ).toBe(false);
  expect(
    lettinDraftSchema.parse({
      ...draft,
      creationGuidance: {
        ...guidance,
        actorId: 'injected',
        licenseGrant: true,
      },
    }).creationGuidance
  ).toEqual(guidance);
});
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
it('publishes guidance explicitly, keeps later edits private, omits it from discovery and clears only after republishing', async () => {
  await mutate(db, owner, {
    action: 'saveWorld',
    worldId,
    version: 1,
    draft: { ...draft, creationGuidance: guidance },
  });
  expect(await readPublic(db, worldId)).toEqual([]);
  await mutate(db, owner, { action: 'publishWorld', worldId, version: 2 });
  expect(
    (await readPublic(db, worldId))[0]!.published.creationGuidance
  ).toEqual(guidance);
  expect((await readPublic(db))[0]!.published).not.toHaveProperty(
    'creationGuidance'
  );
  await mutate(db, owner, {
    action: 'saveWorld',
    worldId,
    version: 3,
    draft: {
      ...draft,
      creationGuidance: {
        ...guidance,
        usageNotes: 'Private revision',
        collaboration: 'closed',
      },
    },
  });
  expect(
    (await readPublic(db, worldId))[0]!.published.creationGuidance
  ).toEqual(guidance);
  await mutate(db, owner, { action: 'saveWorld', worldId, version: 4, draft });
  expect(
    (await readPublic(db, worldId))[0]!.published.creationGuidance
  ).toEqual(guidance);
  await mutate(db, owner, { action: 'publishWorld', worldId, version: 5 });
  expect((await readPublic(db, worldId))[0]!.published).not.toHaveProperty(
    'creationGuidance'
  );
});
it('copies saved entry guidance privately and requires both entry and notebook publication for readers', async () => {
  const entryId = (
    await mutate(db, owner, {
      action: 'createEntry',
      worldId,
      draft: { ...draft, creationGuidance: guidance },
    })
  ).id;
  const clone = (
    await mutate(db, owner, {
      action: 'duplicateEntry',
      worldId,
      entryId,
      version: 1,
      title: 'Copy',
    })
  ).id;
  expect(
    (await readWorld(db, owner, worldId)).entries.find((e) => e.id === clone)
  ).toMatchObject({ published: null, draft: { creationGuidance: guidance } });
  await mutate(db, owner, {
    action: 'publishEntry',
    worldId,
    entryId,
    version: 1,
  });
  expect(await readPublic(db, worldId)).toEqual([]);
  await mutate(db, owner, { action: 'publishWorld', worldId, version: 1 });
  const published = (await readPublic(db, worldId))[0]!;
  expect(published.entries[0]!.published.creationGuidance).toEqual(guidance);
  expect(published.entries.map((e) => e.id)).not.toContain(clone);
});
it('does not turn a collaboration preference into actor access or publishing authority', async () => {
  const editor: Actor = { ...owner, id: 'editor', isAdmin: false };
  await db
    .prepare('INSERT INTO creators(user_id) VALUES (?)')
    .bind(editor.id)
    .run();
  await expect(readWorld(db, editor, worldId)).rejects.toMatchObject({
    status: 403,
  });
  await mutate(db, owner, {
    action: 'setCollaborator',
    worldId,
    userId: editor.id,
    role: 'editor',
  });
  await mutate(db, editor, {
    action: 'saveWorld',
    worldId,
    version: 1,
    draft: {
      ...draft,
      creationGuidance: { ...guidance, collaboration: 'open' },
    },
  });
  await expect(
    mutate(db, editor, { action: 'publishWorld', worldId, version: 2 })
  ).rejects.toMatchObject({ status: 403 });
  await db.prepare('DELETE FROM collaborators').run();
  await expect(
    mutate(db, editor, { action: 'saveWorld', worldId, version: 2, draft })
  ).rejects.toMatchObject({ status: 403 });
});

it.each([true, false])(
  'saving a staged public version only changes the authorized private draft (notebook=%s)',
  async (isWorld) => {
    const original = {
      ...draft,
      title: 'Published source',
      creationGuidance: guidance,
    };
    const entryId = isWorld
      ? worldId
      : (
          await mutate(db, owner, {
            action: 'createEntry',
            worldId,
            draft: original,
          })
        ).id;
    if (isWorld)
      await mutate(db, owner, {
        action: 'saveWorld',
        worldId,
        version: 1,
        draft: original,
      });
    const beforeVersion = isWorld ? 2 : 1;
    await mutate(
      db,
      owner,
      isWorld
        ? { action: 'publishWorld', worldId, version: beforeVersion }
        : { action: 'publishEntry', worldId, entryId, version: beforeVersion }
    );
    if (!isWorld)
      await mutate(db, owner, { action: 'publishWorld', worldId, version: 1 });
    const publishedVersion = beforeVersion + 1;
    const changed = {
      ...original,
      title: 'New private text',
      contentNotice: 'Private notice',
    };
    await mutate(
      db,
      owner,
      isWorld
        ? {
            action: 'saveWorld',
            worldId,
            version: publishedVersion,
            draft: changed,
          }
        : {
            action: 'saveEntry',
            worldId,
            entryId,
            version: publishedVersion,
            draft: changed,
          }
    );
    const view = await readWorld(db, owner, worldId);
    const source = isWorld
      ? view.world
      : view.entries.find((e) => e.id === entryId)!;
    const beforePublic = await readPublic(db, worldId);
    const restore = isWorld
      ? {
          action: 'saveWorld' as const,
          worldId,
          version: source.version,
          draft: structuredClone(source.published!),
        }
      : {
          action: 'saveEntry' as const,
          worldId,
          entryId,
          version: source.version,
          draft: structuredClone(source.published!),
        };
    await expect(
      mutate(db, { ...owner, wsId: 'other-workspace' }, restore)
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      mutate(db, owner, { ...restore, version: source.version - 1 })
    ).rejects.toMatchObject({ status: 409 });
    expect((await readWorld(db, owner, worldId)).world.version).toBe(
      view.world.version
    );
    await mutate(db, owner, restore);
    const after = await readWorld(db, owner, worldId);
    const saved = isWorld
      ? after.world
      : after.entries.find((e) => e.id === entryId)!;
    expect(saved.draft).toEqual(original);
    expect(saved.draft).not.toHaveProperty('contentNotice');
    expect(saved.version).toBe(source.version + 1);
    expect(await readPublic(db, worldId)).toEqual(beforePublic);
  }
);
