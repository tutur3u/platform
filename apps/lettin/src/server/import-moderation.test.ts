import { readFile } from 'node:fs/promises';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Actor, Store } from './context';
import {
  creatorAboutSchema,
  emptyCreatorAbout,
  readCreatorAbout,
  saveCreatorAbout,
} from './creator-about';
import { buildImportPlan } from './import-plan';
import { applyImport, previewImport } from './import-store';
import {
  blacklistItemSchema,
  mutateBlacklist,
  readBlacklist,
} from './moderation';

let mf: Miniflare;
let db: Store;
const owner: Actor = {
  id: 'synthetic-owner',
  wsId: 'synthetic-workspace',
  isAdmin: false,
  canManage: true,
  verifiedEmail: async () => 'synthetic@tuturuuu.com',
  eligibleMember: async () => true,
  memberNames: async () => [],
};
const other = { ...owner, id: 'synthetic-other' };
const plan = () =>
  buildImportPlan(
    {
      entries: [
        {
          stableSourceId: 'character',
          collectionSlug: 'characters',
          title: 'Synthetic hero',
        },
        {
          stableSourceId: 'blacklist',
          collectionSlug: 'commission-blacklist',
          title: 'Synthetic account',
          summary: 'Private synthetic note',
        },
      ],
    },
    'Synthetic import'
  );

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
    [
      'creator_profiles',
      'import_previews',
      'creator_blacklist',
      'media',
      'entries',
      'collaborators',
      'worlds',
      'invitations',
      'creators',
    ].map((table) => db.prepare(`DELETE FROM ${table}`))
  );
  await db.batch(
    [owner, other].map((actor) =>
      db.prepare('INSERT INTO creators(user_id) VALUES (?)').bind(actor.id)
    )
  );
});

describe('Transactional private imports', () => {
  it('imports private drafts atomically and makes a repeated apply idempotent', async () => {
    const preview = await previewImport(db, owner, plan());
    expect(preview).toMatchObject({ count: 1, blacklistCount: 1 });
    expect(preview).not.toHaveProperty('blacklist');
    const result = await applyImport(db, owner, preview.id);
    expect(await applyImport(db, owner, preview.id)).toEqual(result);
    expect(
      await db.prepare('SELECT count(*) AS count FROM worlds').first()
    ).toEqual({ count: 1 });
    expect(
      await db.prepare('SELECT published,published_at FROM worlds').first()
    ).toEqual({ published: null, published_at: null });
    expect(
      await db.prepare('SELECT count(*) AS count FROM entries').first()
    ).toEqual({ count: 1 });
    expect(await readBlacklist(db, owner)).toHaveLength(1);
  });
  it('rejects cross-actor and cross-workspace preview access', async () => {
    const preview = await previewImport(db, owner, plan());
    await expect(applyImport(db, other, preview.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      applyImport(db, { ...owner, wsId: 'another-workspace' }, preview.id)
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await db.prepare('SELECT count(*) AS count FROM worlds').first()
    ).toEqual({ count: 0 });
  });
  it('rejects expired previews and revoked creator access', async () => {
    const preview = await previewImport(db, owner, plan());
    await db
      .prepare(
        "UPDATE import_previews SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?"
      )
      .bind(preview.id)
      .run();
    await expect(applyImport(db, owner, preview.id)).rejects.toMatchObject({
      status: 410,
    });
    await db
      .prepare('UPDATE creators SET enabled=0 WHERE user_id=?')
      .bind(owner.id)
      .run();
    await expect(applyImport(db, owner, preview.id)).rejects.toMatchObject({
      status: 403,
    });
  });
  it('rolls back the world if an entry insert fails', async () => {
    const invalid = plan();
    invalid.entries.push({ ...invalid.entries[0]! });
    const preview = await previewImport(db, owner, invalid);
    await expect(applyImport(db, owner, preview.id)).rejects.toThrow();
    expect(
      await db.prepare('SELECT count(*) AS count FROM worlds').first()
    ).toEqual({ count: 0 });
    expect(
      await db
        .prepare('SELECT applied FROM import_previews WHERE id=?')
        .bind(preview.id)
        .first()
    ).toEqual({ applied: 0 });
  });
  it('does not duplicate imported blacklist records when importing again', async () => {
    for (let i = 0; i < 2; i++) {
      const preview = await previewImport(db, owner, plan());
      await applyImport(db, owner, preview.id);
    }
    expect(await readBlacklist(db, owner)).toHaveLength(1);
  });
});

describe('Personal blacklist ownership', () => {
  const draft = {
    displayName: 'Synthetic account',
    reason: 'Private note',
    referenceUrl: 'https://example.test/account',
  };
  it('supports create, edit, remove while keeping another creator isolated', async () => {
    const result = await mutateBlacklist(db, owner, { action: 'save', draft });
    expect(await readBlacklist(db, other)).toEqual([]);
    await expect(
      mutateBlacklist(db, other, { action: 'remove', id: result.id })
    ).rejects.toMatchObject({ status: 404 });
    await mutateBlacklist(db, owner, {
      action: 'save',
      id: result.id,
      draft: { ...draft, reason: 'Updated' },
    });
    expect(await readBlacklist(db, owner)).toMatchObject([
      { reason: 'Updated' },
    ]);
    await mutateBlacklist(db, owner, { action: 'remove', id: result.id });
    expect(await readBlacklist(db, owner)).toEqual([]);
  });
  it('rejects missing workspace permission and revoked creators', async () => {
    await expect(
      readBlacklist(db, { ...owner, canManage: false })
    ).rejects.toMatchObject({ status: 403 });
    await db
      .prepare('UPDATE creators SET enabled=0 WHERE user_id=?')
      .bind(owner.id)
      .run();
    await expect(
      mutateBlacklist(db, owner, { action: 'save', draft })
    ).rejects.toMatchObject({ status: 403 });
  });
  it.each([
    'javascript:alert(1)',
    'http://example.test',
    'https://',
    'data:text/html,unsafe',
  ])('rejects unsafe references %s', (referenceUrl) => {
    expect(
      blacklistItemSchema.safeParse({ ...draft, referenceUrl }).success
    ).toBe(false);
  });
});

describe('Public creative profile details', () => {
  it('persists first-class About details and themes without changing another creator', async () => {
    const details = {
      ...emptyCreatorAbout,
      headline: 'Synthetic storyteller',
      pronouns: 'they/them',
      location: 'Imaginary coast',
      interests: ['Worldbuilding'],
      links: [{ label: 'Portfolio', url: 'https://example.test' }],
      theme: {
        palette: 'midnight' as const,
        typography: 'clean' as const,
        motion: 'reduced' as const,
      },
    };
    await saveCreatorAbout(db, owner, details);
    expect(await readCreatorAbout(db, owner.id)).toEqual(details);
    expect(await readCreatorAbout(db, other.id)).toEqual(emptyCreatorAbout);
  });
  it('rejects writes after approval or workspace permission is revoked', async () => {
    await expect(
      saveCreatorAbout(db, { ...owner, canManage: false }, emptyCreatorAbout)
    ).rejects.toMatchObject({ status: 403 });
    await db
      .prepare('UPDATE creators SET enabled=0 WHERE user_id=?')
      .bind(owner.id)
      .run();
    await expect(
      saveCreatorAbout(db, owner, emptyCreatorAbout)
    ).rejects.toMatchObject({ status: 403 });
  });
  it.each(['https://', 'javascript:alert(1)', 'http://example.test'])(
    'rejects unsafe About links %s',
    (url) => {
      expect(
        creatorAboutSchema.safeParse({
          ...emptyCreatorAbout,
          links: [{ label: 'Unsafe', url }],
        }).success
      ).toBe(false);
    }
  );
  it('rejects private task mentions and arbitrary themes', () => {
    expect(
      creatorAboutSchema.safeParse({
        ...emptyCreatorAbout,
        content: {
          type: 'doc',
          content: [{ type: 'taskMention', attrs: { id: 'private-task' } }],
        },
      }).success
    ).toBe(false);
    expect(
      creatorAboutSchema.safeParse({
        ...emptyCreatorAbout,
        theme: { ...emptyCreatorAbout.theme, palette: 'custom-script' },
      }).success
    ).toBe(false);
  });
});
