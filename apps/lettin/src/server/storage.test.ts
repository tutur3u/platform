import { readFile } from 'node:fs/promises';
import type { LettinDraft } from '@tuturuuu/internal-api/lettin';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Actor, LettinError, type Store, worldRole } from './context';
import { getMedia, uploadMedia } from './media';
import { mutate } from './mutations';
import { readOverview, readPublic } from './queries';

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
  const migration = await readFile(
    new URL('../../migrations/0001_worldbuilding.sql', import.meta.url),
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
