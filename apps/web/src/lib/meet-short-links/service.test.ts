import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  createVanityMeetShortLink,
  deleteMeetShortLink,
  ensureGeneratedMeetShortLink,
  listMeetShortLinks,
  type MeetShortLinkContext,
  type MeetShortLinkRepository,
  type MeetShortLinkRow,
  updateVanityMeetShortLink,
} from './service';

const NOW = Date.parse('2026-11-21T00:00:00.000Z');
const DAY = 86_400_000;

function memoryRepo(seed: MeetShortLinkRow[] = []) {
  const rows = [...seed];
  const audits: Parameters<MeetShortLinkRepository['audit']>[0][] = [];
  const taken = new Set<string>(['taken-slug', 'qr-taken']);
  let next = 0;
  const repo: MeetShortLinkRepository = {
    list: async () => rows.map((row) => ({ ...row })),
    purgeExpired: async (_meetingId, nowIso) => {
      for (let i = rows.length - 1; i >= 0; i -= 1)
        if (Date.parse(rows[i]!.expiresAt) <= Date.parse(nowIso))
          rows.splice(i, 1);
    },
    clicks: async (ids) => Object.fromEntries(ids.map((id) => [id, 2])),
    insert: async (row) => {
      if (taken.has(row.slug) || rows.some((r) => r.slug === row.slug))
        return 'taken';
      expect(row.link).toBe('https://tuturuuu.com/meet/ws-1/meetings/m-1');
      const created: MeetShortLinkRow = {
        id: `l${(next += 1)}`,
        slug: row.slug,
        kind: row.kind,
        creatorId: row.creatorId,
        expiresAt: row.expiresAt,
      };
      rows.push(created);
      return { ...created };
    },
    update: async (id, _meetingId, patch) => {
      if (patch.slug && taken.has(patch.slug)) return 'taken';
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      Object.assign(row, {
        ...(patch.slug ? { slug: patch.slug } : {}),
        ...(patch.expiresAt ? { expiresAt: patch.expiresAt } : {}),
        ...(patch.creatorId ? { creatorId: patch.creatorId } : {}),
      });
      return { ...row };
    },
    remove: async (id) => {
      const index = rows.findIndex((r) => r.id === id);
      if (index < 0) return false;
      rows.splice(index, 1);
      return true;
    },
    recentActions: async (actorId, kind) =>
      audits.filter((a) => a.actorId === actorId && a.kind === kind).length,
    audit: async (entry) => {
      audits.push(entry);
    },
  };
  return { repo, rows, audits };
}

function context(
  repo: MeetShortLinkRepository,
  overrides: Partial<MeetShortLinkContext> = {}
): MeetShortLinkContext {
  return {
    repo,
    wsId: 'ws-1',
    meetingId: 'm-1',
    meetingTime: null,
    actorId: 'u-paid',
    staff: false,
    eligible: true,
    manager: false,
    now: NOW,
    ...overrides,
  };
}

describe('generated meeting links', () => {
  it('creates one ttr.gg/meet code for an eligible host and reuses it', async () => {
    const { repo, rows, audits } = memoryRepo();
    const ctx = context(repo);
    const first = await ensureGeneratedMeetShortLink(ctx);
    expect(first.url).toMatch(/^https:\/\/ttr\.gg\/meet\/[A-Za-z0-9]{7}$/);
    expect(first.prefixed).toBe(true);
    expect(Date.parse(first.expiresAt)).toBe(NOW + 30 * DAY);
    const again = await ensureGeneratedMeetShortLink(ctx);
    expect(again.slug).toBe(first.slug);
    expect(rows).toHaveLength(1);
    expect(audits.map((a) => a.action)).toEqual(['create']);
  });

  it('renews at most daily and returns a link created in parallel', async () => {
    const { repo, rows } = memoryRepo();
    const ctx = context(repo);
    const first = await ensureGeneratedMeetShortLink(ctx);
    await ensureGeneratedMeetShortLink({ ...ctx, now: NOW + 3_600_000 });
    expect(rows[0]?.expiresAt).toBe(first.expiresAt);
    const later = await ensureGeneratedMeetShortLink({
      ...ctx,
      now: NOW + 2 * DAY,
    });
    expect(Date.parse(later.expiresAt)).toBe(NOW + 32 * DAY);
    const raced = { ...repo, insert: async () => 'taken' as const };
    const again = await ensureGeneratedMeetShortLink({
      ...ctx,
      repo: { ...raced, list: async () => [] },
    }).catch((error: { code: string }) => error.code);
    expect(again).toBe('unavailable');
    let calls = 0;
    const seen = await ensureGeneratedMeetShortLink({
      ...ctx,
      repo: {
        ...raced,
        list: async () => (calls++ === 0 ? [] : rows.map((r) => ({ ...r }))),
      },
    });
    expect(seen.slug).toBe(first.slug);
  });

  it('expires 30 days after a later scheduled meeting time', async () => {
    const { repo } = memoryRepo();
    const time = new Date(NOW + 10 * DAY).toISOString();
    const link = await ensureGeneratedMeetShortLink(
      context(repo, { meetingTime: time })
    );
    expect(Date.parse(link.expiresAt)).toBe(NOW + 40 * DAY);
  });

  it('refuses ineligible users and lists nothing for them', async () => {
    const { repo } = memoryRepo();
    const ctx = context(repo, { eligible: false });
    await expect(ensureGeneratedMeetShortLink(ctx)).rejects.toMatchObject({
      code: 'not_eligible',
      status: 403,
    });
    await expect(
      createVanityMeetShortLink(
        context(repo, { eligible: false, staff: true }),
        { slug: 'off-room' }
      )
    ).rejects.toMatchObject({ code: 'not_eligible' });
    const state = await listMeetShortLinks(ctx);
    expect(state).toMatchObject({
      eligible: false,
      links: [],
      canonicalUrl: 'https://tuturuuu.com/meet/ws-1/meetings/m-1',
    });
  });

  it('lets only staff drop the meet/ prefix', async () => {
    const { repo, rows } = memoryRepo();
    await expect(
      ensureGeneratedMeetShortLink(context(repo), { prefixed: false })
    ).rejects.toMatchObject({ code: 'staff_only' });
    const staff = context(repo, { staff: true, actorId: 'u-staff' });
    const prefixed = await ensureGeneratedMeetShortLink(context(repo));
    const root = await ensureGeneratedMeetShortLink(staff, { prefixed: false });
    expect(rows[0]?.creatorId).toBe('u-staff');
    expect(root.slug).toBe(prefixed.slug.slice('meet/'.length));
    expect(root.url).toMatch(/^https:\/\/ttr\.gg\/[A-Za-z0-9]{7}$/);
    // A paid member asking with the default form keeps the staff choice.
    const kept = await ensureGeneratedMeetShortLink(context(repo), {
      prefixed: true,
    });
    expect(kept.slug).toBe(root.slug);
  });

  it('rate-limits generated link changes per actor', async () => {
    const { repo, audits } = memoryRepo();
    for (let i = 0; i < 20; i += 1)
      audits.push({
        wsId: 'ws-1',
        meetingId: `m-${i}`,
        actorId: 'u-paid',
        action: 'create',
        kind: 'generated',
        slug: `meet/x${i}`,
      });
    await expect(
      ensureGeneratedMeetShortLink(context(repo))
    ).rejects.toMatchObject({ code: 'rate_limited', status: 429 });
  });

  it('hides and purges expired links', async () => {
    const { repo, rows } = memoryRepo([
      {
        id: 'old',
        slug: 'meet/Old1234',
        kind: 'generated',
        creatorId: 'u-paid',
        expiresAt: new Date(NOW - 1).toISOString(),
      },
    ]);
    expect((await listMeetShortLinks(context(repo))).links).toEqual([]);
    expect(rows).toEqual([]);
  });
});

describe('staff vanity links', () => {
  const staff = (repo: MeetShortLinkRepository) =>
    context(repo, { staff: true, actorId: 'u-staff' });

  it('lets staff set, rename and delete their own vanity slug', async () => {
    const { repo, rows, audits } = memoryRepo();
    const created = await createVanityMeetShortLink(staff(repo), {
      slug: 'phuc-standup',
    });
    expect(created.url).toBe('https://ttr.gg/phuc-standup');
    expect(Date.parse(created.expiresAt)).toBe(NOW + 365 * DAY);
    const prefixed = await createVanityMeetShortLink(staff(repo), {
      slug: 'weekly',
      prefixed: true,
    });
    expect(prefixed.url).toBe('https://ttr.gg/meet/weekly');
    const renamed = await updateVanityMeetShortLink(staff(repo), created.id, {
      slug: 'phuc-sync',
    });
    expect(renamed.slug).toBe('phuc-sync');
    await deleteMeetShortLink(staff(repo), renamed.id);
    expect(rows.map((r) => r.slug)).toEqual(['meet/weekly']);
    expect(audits.map((a) => [a.action, a.slug, a.previousSlug])).toEqual([
      ['create', 'phuc-standup', undefined],
      ['create', 'meet/weekly', undefined],
      ['update', 'phuc-sync', 'phuc-standup'],
      ['delete', 'phuc-sync', undefined],
    ]);
  });

  it('rejects non-staff, bad, reserved and taken slugs', async () => {
    const { repo } = memoryRepo();
    await expect(
      createVanityMeetShortLink(context(repo), { slug: 'paid-room' })
    ).rejects.toMatchObject({ code: 'staff_only' });
    for (const slug of [
      'ab',
      'Upper',
      'a_b',
      '-lead',
      'two--dash',
      'x'.repeat(41),
    ])
      await expect(
        createVanityMeetShortLink(staff(repo), { slug })
      ).rejects.toMatchObject({ code: 'invalid_slug', status: 400 });
    for (const slug of ['api', 'meet', 'admin'])
      await expect(
        createVanityMeetShortLink(staff(repo), { slug })
      ).rejects.toMatchObject({ code: 'reserved_slug' });
    await expect(
      createVanityMeetShortLink(staff(repo), { slug: 'taken-slug' })
    ).rejects.toMatchObject({ code: 'taken', status: 409 });
  });

  it("keeps another staff member's vanity slug out of reach", async () => {
    const { repo } = memoryRepo([
      {
        id: 'v1',
        slug: 'owner-room',
        kind: 'vanity',
        creatorId: 'u-owner',
        expiresAt: new Date(NOW + DAY).toISOString(),
      },
    ]);
    await expect(
      updateVanityMeetShortLink(staff(repo), 'v1', { slug: 'mine-now' })
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      deleteMeetShortLink(context(repo, { manager: true }), 'v1')
    ).rejects.toMatchObject({ code: 'forbidden' });
    const listed = await listMeetShortLinks(staff(repo));
    expect(listed.links[0]).toMatchObject({ canEdit: false, canDelete: false });
  });
});
