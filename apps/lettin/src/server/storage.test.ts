import { readFile } from 'node:fs/promises';
import type { LettinDraft } from '@tuturuuu/internal-api/lettin';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { quickNoteDraft } from '../components/quick-note-model';
import { type Actor, LettinError, type Store, worldRole } from './context';
import { getMedia, uploadMedia } from './media';
import { cleanupMedia } from './media-cleanup';
import { mutate } from './mutations';
import { readOverview, readPublic, readWorld } from './queries';

let mf: Miniflare;
let db: Store;
let bucket: R2Bucket;
const owner: Actor = {
  id: 'owner',
  wsId: 'workspace',
  isAdmin: true,
  canManage: true,
  verifiedEmail: async () => 'owner@example.test',
  eligibleMember: async () => true,
  memberNames: async () => [],
};
const editor: Actor = {
  ...owner,
  id: 'editor',
  isAdmin: false,
  verifiedEmail: async () => 'editor@example.test',
};
const draft: LettinDraft = {
  title: 'Private world',
  description: '',
  image: '',
  credit: '',
  kind: 'page',
  tags: [],
  links: [],
  content: { type: 'doc', content: [{ type: 'paragraph' }] },
};
let worldId: string;
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      compatibilityDate: '2026-09-14',
      d1Databases: ['DB'],
      r2Buckets: ['MEDIA'],
    })
  );
  db = await mf.getD1Database('DB');
  // Miniflare exposes Node stream types across its workerd proxy boundary.
  bucket = (await mf.getR2Bucket('MEDIA')) as unknown as R2Bucket;
  for (const name of [
    '0001_worldbuilding.sql',
    '0002_public_indexes.sql',
    '0003_media_cleanup.sql',
    '0004_creator_imports_and_moderation.sql',
  ]) {
    const migration = await readFile(
      new URL(`../../migrations/${name}`, import.meta.url),
      'utf8'
    );
    await db.batch(
      migration
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
    [
      'media',
      'entries',
      'collaborators',
      'worlds',
      'invitations',
      'creators',
    ].map((t) => db.prepare(`DELETE FROM ${t}`))
  );
  await db
    .prepare('INSERT INTO creators(user_id) VALUES (?)')
    .bind(editor.id)
    .run();
  worldId = (await mutate(db, owner, { action: 'createWorld', draft })).id;
  await mutate(db, owner, {
    action: 'setCollaborator',
    worldId,
    userId: editor.id,
    role: 'editor',
  });
});

describe('D1 authorization and publishing', () => {
  it('requires creator approval and live workspace permission', async () => {
    await expect(
      mutate(
        db,
        { ...editor, id: 'outsider' },
        { action: 'createWorld', draft }
      )
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      worldRole(db, { ...owner, canManage: false }, worldId)
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      worldRole(db, { ...owner, wsId: 'other' }, worldId)
    ).rejects.toMatchObject({ status: 403 });
  });
  it('lets editors save but only publishers publish', async () => {
    await mutate(db, editor, {
      action: 'saveWorld',
      worldId,
      version: 1,
      draft: { ...draft, title: 'Edited' },
    });
    await expect(
      mutate(db, editor, { action: 'publishWorld', worldId, version: 2 })
    ).rejects.toMatchObject({ status: 403 });
    await mutate(db, owner, {
      action: 'setCollaborator',
      worldId,
      userId: editor.id,
      role: 'publisher',
    });
    await mutate(db, editor, { action: 'publishWorld', worldId, version: 2 });
    expect((await readPublic(db, worldId))[0]?.published.title).toBe('Edited');
  });
  it('rejects stale revisions without overwriting the saved draft', async () => {
    await mutate(db, owner, {
      action: 'saveWorld',
      worldId,
      version: 1,
      draft: { ...draft, title: 'Winner' },
    });
    await expect(
      mutate(db, editor, { action: 'saveWorld', worldId, version: 1, draft })
    ).rejects.toMatchObject({ status: 409 });
    expect((await readOverview(db, owner)).worlds[0]?.draft.title).toBe(
      'Winner'
    );
  });
  it('revokes access when a collaborator or creator is disabled', async () => {
    await mutate(db, owner, {
      action: 'removeCollaborator',
      worldId,
      userId: editor.id,
    });
    await expect(worldRole(db, editor, worldId)).rejects.toMatchObject({
      status: 403,
    });
    await mutate(db, owner, {
      action: 'setCollaborator',
      worldId,
      userId: editor.id,
      role: 'editor',
    });
    await mutate(db, owner, {
      action: 'setCreator',
      userId: editor.id,
      canInvite: false,
      enabled: false,
    });
    await expect(worldRole(db, editor, worldId)).rejects.toMatchObject({
      status: 403,
    });
  });
  it('publishes snapshots without exposing later drafts', async () => {
    expect(await readPublic(db, worldId)).toEqual([]);
    await mutate(db, owner, { action: 'publishWorld', worldId, version: 1 });
    await mutate(db, owner, {
      action: 'saveWorld',
      worldId,
      version: 2,
      draft: { ...draft, title: 'Unpublished revision' },
    });
    expect(JSON.stringify(await readPublic(db, worldId))).not.toContain(
      'Unpublished revision'
    );
    await mutate(db, owner, { action: 'unpublishWorld', worldId, version: 3 });
    expect(await readPublic(db, worldId)).toEqual([]);
  });
  it('keeps notice revisions private until republished, including catalogue cards', async () => {
    await mutate(db, owner, {
      action: 'saveWorld',
      worldId,
      version: 1,
      draft: { ...draft, contentNotice: 'Published spoilers' },
    });
    await mutate(db, owner, { action: 'publishWorld', worldId, version: 2 });
    await mutate(db, owner, {
      action: 'saveWorld',
      worldId,
      version: 3,
      draft: { ...draft, contentNotice: 'Private revision' },
    });
    expect((await readPublic(db, worldId))[0]?.published.contentNotice).toBe(
      'Published spoilers'
    );
    expect((await readPublic(db))[0]?.published.contentNotice).toBe(
      'Published spoilers'
    );
    await mutate(db, owner, {
      action: 'saveWorld',
      worldId,
      version: 4,
      draft: { ...draft, contentNotice: '' },
    });
    expect((await readPublic(db, worldId))[0]?.published.contentNotice).toBe(
      'Published spoilers'
    );
    await mutate(db, owner, { action: 'publishWorld', worldId, version: 5 });
    expect((await readPublic(db))[0]?.published.contentNotice).toBe('');
  });
  it('filters unpublished relationships and rejects cross-world links', async () => {
    const a = (
      await mutate(db, owner, { action: 'createEntry', worldId, draft })
    ).id;
    const b = (
      await mutate(db, owner, { action: 'createEntry', worldId, draft })
    ).id;
    await mutate(db, owner, {
      action: 'saveEntry',
      worldId,
      entryId: a,
      version: 1,
      draft: { ...draft, links: [b] },
    });
    await mutate(db, owner, {
      action: 'publishEntry',
      worldId,
      entryId: a,
      version: 2,
    });
    await mutate(db, owner, { action: 'publishWorld', worldId, version: 1 });
    expect(JSON.stringify(await readPublic(db, worldId))).not.toContain(b);
    const other = (await mutate(db, owner, { action: 'createWorld', draft }))
      .id;
    const foreign = (
      await mutate(db, owner, { action: 'createEntry', worldId: other, draft })
    ).id;
    await expect(
      mutate(db, owner, {
        action: 'saveEntry',
        worldId,
        entryId: a,
        version: 3,
        draft: { ...draft, links: [foreign] },
      })
    ).rejects.toBeInstanceOf(LettinError);
  });
});
describe('D1 invitations', () => {
  it('binds single-use invitations to verified email without delegating privileges', async () => {
    const { id } = await mutate(db, owner, {
      action: 'invite',
      email: 'editor@example.test',
    });
    await expect(
      mutate(
        db,
        { ...editor, verifiedEmail: async () => null },
        { action: 'acceptInvitation', invitationId: id }
      )
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      mutate(
        db,
        { ...editor, verifiedEmail: async () => 'wrong@example.test' },
        { action: 'acceptInvitation', invitationId: id }
      )
    ).rejects.toMatchObject({ status: 403 });
    await mutate(db, editor, { action: 'acceptInvitation', invitationId: id });
    await expect(
      mutate(db, editor, { action: 'acceptInvitation', invitationId: id })
    ).rejects.toMatchObject({ status: 403 });
    expect((await readOverview(db, editor)).canInvite).toBe(false);
  });
  it('restricts delegation to root admins and invitations to their owner', async () => {
    await mutate(db, owner, {
      action: 'setCreator',
      userId: editor.id,
      canInvite: true,
      enabled: true,
    });
    const invitation = await mutate(db, editor, {
      action: 'invite',
      email: 'new@example.test',
    });
    await expect(
      mutate(db, editor, {
        action: 'setCreator',
        userId: editor.id,
        canInvite: true,
        enabled: true,
      })
    ).rejects.toMatchObject({ status: 403 });
    await db
      .prepare('INSERT INTO creators(user_id,can_invite) VALUES (?,1)')
      .bind('another')
      .run();
    await expect(
      mutate(
        db,
        { ...editor, id: 'another' },
        { action: 'revokeInvitation', invitationId: invitation.id }
      )
    ).rejects.toMatchObject({ status: 403 });
    await mutate(db, editor, {
      action: 'revokeInvitation',
      invitationId: invitation.id,
    });
  });
  it('does not re-enable a revoked creator through an older invitation', async () => {
    const invitation = await mutate(db, owner, {
      action: 'invite',
      email: 'editor@example.test',
    });
    await mutate(db, owner, {
      action: 'setCreator',
      userId: editor.id,
      canInvite: false,
      enabled: false,
    });
    await mutate(db, editor, {
      action: 'acceptInvitation',
      invitationId: invitation.id,
    });
    expect((await readOverview(db, editor)).approved).toBe(false);
  });
});
describe('R2 artwork', () => {
  it('serves private artwork only to collaborators and revokes public access on unpublish', async () => {
    const uploaded = await uploadMedia(
      db,
      bucket,
      owner,
      worldId,
      new File(['png-data'], 'art.png', { type: 'image/png' })
    );
    const id = uploaded.image.split('/').at(-1)!;
    await expect(
      getMedia(db, bucket, id, async () => ({ ...editor, id: 'outsider' }))
    ).rejects.toMatchObject({ status: 404 });
    const anonymous = async () => {
      throw new LettinError(401);
    };
    await expect(getMedia(db, bucket, id, anonymous)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      await (await getMedia(db, bucket, id, async () => owner)).text()
    ).toBe('png-data');
    await mutate(db, owner, {
      action: 'saveWorld',
      worldId,
      version: 1,
      draft: { ...draft, image: uploaded.image },
    });
    await mutate(db, owner, { action: 'publishWorld', worldId, version: 2 });
    const response = await getMedia(db, bucket, id, anonymous);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.text()).toBe('png-data');
    await mutate(db, owner, { action: 'unpublishWorld', worldId, version: 3 });
    await expect(getMedia(db, bucket, id, anonymous)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('rejects unsupported artwork and unauthorized uploads', async () => {
    await expect(
      uploadMedia(
        db,
        bucket,
        owner,
        worldId,
        new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' })
      )
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      uploadMedia(
        db,
        bucket,
        { ...editor, id: 'outsider' },
        worldId,
        new File(['a'], 'a.png', { type: 'image/png' })
      )
    ).rejects.toMatchObject({ status: 403 });
  });
});

it('collects abandoned artwork while retaining draft and published references', async () => {
  const unused = await uploadMedia(
    db,
    bucket,
    owner,
    worldId,
    new File(['image'], 'art.png', { type: 'image/png' })
  );
  const used = await uploadMedia(
    db,
    bucket,
    owner,
    worldId,
    new File(['image'], 'art.png', { type: 'image/png' })
  );
  await mutate(db, owner, {
    action: 'saveWorld',
    worldId,
    version: 1,
    draft: { ...draft, image: used.image },
  });
  await mutate(db, owner, { action: 'publishWorld', worldId, version: 2 });
  await mutate(db, owner, { action: 'saveWorld', worldId, version: 3, draft });
  await db
    .prepare("UPDATE media SET created_at='2000-01-01T00:00:00.000Z'")
    .run();
  await cleanupMedia(db, bucket, worldId);
  await expect(
    getMedia(db, bucket, unused.image.split('/').at(-1)!, async () => owner)
  ).rejects.toMatchObject({ status: 404 });
  expect(
    (
      await getMedia(
        db,
        bucket,
        used.image.split('/').at(-1)!,
        async () => owner
      )
    ).status
  ).toBe(200);
  await expect(
    mutate(db, owner, {
      action: 'saveWorld',
      worldId,
      version: 4,
      draft: { ...draft, image: unused.image },
    })
  ).rejects.toMatchObject({ status: 409 });
});

it('returns bounded creator catalogue summaries without entry documents', async () => {
  for (let i = 0; i < 27; i++) {
    const id = (
      await mutate(db, owner, {
        action: 'createWorld',
        draft: { ...draft, title: `Catalogue ${i}` },
      })
    ).id;
    await mutate(db, owner, {
      action: 'publishWorld',
      worldId: id,
      version: 1,
    });
  }
  const page = await readPublic(db, undefined, { creatorId: owner.id });
  expect(page).toHaveLength(25);
  expect(
    page.every(
      (world) =>
        world.entries.length === 0 &&
        world.published.content.content?.length === 0
    )
  ).toBe(true);
  expect(
    await readPublic(db, undefined, { page: 2, creatorId: owner.id })
  ).toHaveLength(3);
  expect(await readPublic(db, undefined, { creatorId: 'outsider' })).toEqual(
    []
  );
});
it('allows invitation owners to revoke after delegation is disabled', async () => {
  await db
    .prepare("UPDATE creators SET can_invite=1 WHERE user_id='editor'")
    .run();
  const invitation = await mutate(db, editor, {
    action: 'invite',
    email: 'reader@example.test',
  });
  await mutate(db, owner, {
    action: 'setCreator',
    userId: editor.id,
    canInvite: false,
    enabled: false,
  });
  await expect(
    mutate(db, editor, {
      action: 'revokeInvitation',
      invitationId: invitation.id,
    })
  ).resolves.toEqual(invitation);
});

describe('Wiki graph and inline artwork', () => {
  it('saves typed relationships, rejects foreign targets, and hides unpublished references in world and entry snapshots', async () => {
    const a = (
      await mutate(db, owner, {
        action: 'createEntry',
        worldId,
        draft: { ...draft, kind: 'character' },
      })
    ).id;
    const b = (
      await mutate(db, owner, {
        action: 'createEntry',
        worldId,
        draft: { ...draft, kind: 'location' },
      })
    ).id;
    const wiki = {
      aliases: ['The Wanderer'],
      facts: [{ label: 'Origin', value: 'North' }],
      chronology: {
        order: -120,
        label: 'Before the crossing',
        era: 'First age',
      },
      relationships: [
        { targetId: b, kind: 'located' as const, label: 'Lives in' },
      ],
    };
    await mutate(db, owner, {
      action: 'saveEntry',
      worldId,
      entryId: a,
      version: 1,
      draft: { ...draft, wiki },
    });
    await mutate(db, owner, {
      action: 'saveWorld',
      worldId,
      version: 1,
      draft: { ...draft, wiki },
    });
    await mutate(db, owner, {
      action: 'publishEntry',
      worldId,
      entryId: a,
      version: 2,
    });
    await mutate(db, owner, { action: 'publishWorld', worldId, version: 2 });
    let publicWorld = (await readPublic(db, worldId))[0]!;
    expect(publicWorld.published.wiki?.relationships).toEqual([]);
    expect(publicWorld.entries[0]?.published.wiki).toMatchObject({
      aliases: ['The Wanderer'],
      relationships: [],
      chronology: { order: -120 },
    });
    await mutate(db, owner, {
      action: 'publishEntry',
      worldId,
      entryId: b,
      version: 1,
    });
    publicWorld = (await readPublic(db, worldId))[0]!;
    expect(publicWorld.published.wiki?.relationships).toHaveLength(1);
    expect(
      publicWorld.entries.find((entry) => entry.id === a)?.published.wiki
        ?.relationships[0]?.targetId
    ).toBe(b);
    const other = (await mutate(db, owner, { action: 'createWorld', draft }))
      .id;
    const foreign = (
      await mutate(db, owner, { action: 'createEntry', worldId: other, draft })
    ).id;
    await expect(
      mutate(db, owner, {
        action: 'saveEntry',
        worldId,
        entryId: a,
        version: 3,
        draft: {
          ...draft,
          wiki: {
            ...wiki,
            relationships: [{ targetId: foreign, kind: 'related', label: '' }],
          },
        },
      })
    ).rejects.toBeInstanceOf(LettinError);
    await expect(
      mutate(db, owner, {
        action: 'saveEntry',
        worldId,
        entryId: a,
        version: 3,
        draft: {
          ...draft,
          wiki: {
            ...wiki,
            relationships: [{ targetId: a, kind: 'related', label: '' }],
          },
        },
      })
    ).rejects.toMatchObject({ status: 400 });
    await mutate(db, owner, {
      action: 'unpublishEntry',
      worldId,
      entryId: b,
      version: 2,
    });
    expect(JSON.stringify(await readPublic(db, worldId))).not.toContain(b);
  });
  it('keeps inline uploads alive and grants anonymous access only while their snapshot is published', async () => {
    const artwork = await uploadMedia(
      db,
      bucket,
      owner,
      worldId,
      new File(['inline'], 'inline.png', { type: 'image/png' })
    );
    const id = artwork.image.split('/').at(-1)!;
    const anonymous = async () => {
      throw new LettinError(401);
    };
    const content = {
      type: 'doc',
      content: [
        { type: 'imageResize', attrs: { src: artwork.image, width: '320px' } },
      ],
    };
    await mutate(db, owner, {
      action: 'saveWorld',
      worldId,
      version: 1,
      draft: { ...draft, content },
    });
    await db
      .prepare("UPDATE media SET created_at='2000-01-01T00:00:00.000Z'")
      .run();
    await cleanupMedia(db, bucket, worldId);
    expect((await getMedia(db, bucket, id, async () => owner)).status).toBe(
      200
    );
    await expect(getMedia(db, bucket, id, anonymous)).rejects.toMatchObject({
      status: 404,
    });
    await mutate(db, owner, { action: 'publishWorld', worldId, version: 2 });
    await mutate(db, owner, {
      action: 'saveWorld',
      worldId,
      version: 3,
      draft,
    });
    await cleanupMedia(db, bucket, worldId);
    expect(await (await getMedia(db, bucket, id, anonymous)).text()).toBe(
      'inline'
    );
    await mutate(db, owner, { action: 'unpublishWorld', worldId, version: 4 });
    await expect(getMedia(db, bucket, id, anonymous)).rejects.toMatchObject({
      status: 404,
    });
    await cleanupMedia(db, bucket, worldId);
    await expect(
      getMedia(db, bucket, id, async () => owner)
    ).rejects.toMatchObject({ status: 404 });
  });
});

it.each(['page', 'character', 'story'] as const)(
  'keeps quick-captured %s entries unpublished with live notebook and workspace access checks',
  async (kind) => {
    const note = quickNoteDraft('Idea', 'Private thought', kind)!;
    const entryId = (
      await mutate(db, editor, { action: 'createEntry', worldId, draft: note })
    ).id;
    const entry = (await readWorld(db, owner, worldId)).entries.find(
      (e) => e.id === entryId
    )!;
    expect(entry.draft).toEqual(note);
    expect(entry.published).toBeNull();
    await mutate(db, owner, { action: 'publishWorld', worldId, version: 1 });
    expect((await readPublic(db, worldId))[0]!.entries).toEqual([]);
    await expect(
      mutate(
        db,
        { ...owner, wsId: 'other' },
        { action: 'createEntry', worldId, draft: note }
      )
    ).rejects.toMatchObject({ status: 403 });
    await db
      .prepare('DELETE FROM collaborators WHERE world_id = ? AND user_id = ?')
      .bind(worldId, editor.id)
      .run();
    await expect(
      mutate(db, editor, { action: 'createEntry', worldId, draft: note })
    ).rejects.toMatchObject({ status: 403 });
  }
);
