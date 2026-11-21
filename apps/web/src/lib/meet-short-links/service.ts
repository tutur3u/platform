import {
  generateMeetShortCode,
  isMeetLinkExpired,
  MEET_GENERATED_PER_HOUR,
  MEET_VANITY_CHANGES_PER_HOUR,
  MEET_VANITY_PER_MEETING,
  type MeetShortLinkKind,
  meetCanonicalJoinUrl,
  meetGeneratedExpiry,
  meetShortLinkUrl,
  meetSlugCode,
  meetStoredSlug,
  meetVanityExpiry,
  validateVanitySlug,
} from '@tuturuuu/utils/meet-short-link-policy';

export interface MeetShortLinkRow {
  id: string;
  slug: string;
  kind: MeetShortLinkKind;
  creatorId: string;
  expiresAt: string;
}

export type MeetShortLinkAuditAction = 'create' | 'update' | 'delete';

/** Service-role storage port; every write is scoped to one meeting. */
export interface MeetShortLinkRepository {
  list(meetingId: string): Promise<MeetShortLinkRow[]>;
  purgeExpired(meetingId: string, nowIso: string): Promise<void>;
  clicks(linkIds: string[]): Promise<Record<string, number>>;
  /**
   * Resolves `taken` on a slug uniqueness conflict and `limit` when the
   * database refuses another vanity slug for the meeting.
   */
  insert(row: {
    slug: string;
    kind: MeetShortLinkKind;
    link: string;
    creatorId: string;
    wsId: string;
    meetingId: string;
    expiresAt: string;
  }): Promise<MeetShortLinkRow | 'taken' | 'limit'>;
  update(
    id: string,
    meetingId: string,
    patch: { slug?: string; expiresAt?: string; creatorId?: string }
  ): Promise<MeetShortLinkRow | 'taken' | null>;
  remove(id: string, meetingId: string): Promise<boolean>;
  recentActions(
    actorId: string,
    kind: MeetShortLinkKind,
    sinceIso: string
  ): Promise<number>;
  audit(entry: {
    wsId: string;
    meetingId: string;
    actorId: string;
    action: MeetShortLinkAuditAction;
    kind: MeetShortLinkKind;
    slug: string;
    previousSlug?: string | null;
  }): Promise<void>;
}

export interface MeetShortLinkContext {
  repo: MeetShortLinkRepository;
  wsId: string;
  meetingId: string;
  meetingTime: string | null;
  actorId: string;
  /** Verified internal staff, from the subject-bound Auth user. */
  staff: boolean;
  /** Staff, or the meeting host is on a paid plan. */
  eligible: boolean;
  /** Meeting creator or workspace admin. */
  manager: boolean;
  now?: number;
}

export type MeetShortLinkErrorCode =
  | 'not_eligible'
  | 'staff_only'
  | 'invalid_slug'
  | 'reserved_slug'
  | 'taken'
  | 'rate_limited'
  | 'vanity_limit'
  | 'not_found'
  | 'forbidden'
  | 'unavailable';

const STATUS: Record<MeetShortLinkErrorCode, number> = {
  not_eligible: 403,
  staff_only: 403,
  forbidden: 403,
  invalid_slug: 400,
  reserved_slug: 400,
  taken: 409,
  vanity_limit: 409,
  rate_limited: 429,
  not_found: 404,
  unavailable: 503,
};

export class MeetShortLinkError extends Error {
  readonly status: number;
  constructor(readonly code: MeetShortLinkErrorCode) {
    super(code);
    this.status = STATUS[code];
  }
}

export interface MeetShortLinkView {
  id: string;
  slug: string;
  url: string;
  kind: MeetShortLinkKind;
  prefixed: boolean;
  expiresAt: string;
  clicks: number;
  canEdit: boolean;
  canDelete: boolean;
}

export interface MeetShortLinksState {
  eligible: boolean;
  staff: boolean;
  canonicalUrl: string;
  links: MeetShortLinkView[];
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const GENERATE_ATTEMPTS = 5;

function nowOf(ctx: MeetShortLinkContext) {
  return ctx.now ?? Date.now();
}

function canDelete(ctx: MeetShortLinkContext, row: MeetShortLinkRow) {
  return row.kind === 'vanity'
    ? ctx.staff && row.creatorId === ctx.actorId
    : ctx.staff || ctx.manager;
}

function view(
  ctx: MeetShortLinkContext,
  row: MeetShortLinkRow,
  clicks: Record<string, number>
): MeetShortLinkView {
  return {
    id: row.id,
    slug: row.slug,
    url: meetShortLinkUrl(row.slug),
    kind: row.kind,
    prefixed: meetSlugCode(row.slug).prefixed,
    expiresAt: row.expiresAt,
    clicks: clicks[row.id] ?? 0,
    canEdit:
      row.kind === 'vanity' && ctx.staff && row.creatorId === ctx.actorId,
    canDelete: canDelete(ctx, row),
  };
}

export async function listMeetShortLinks(
  ctx: MeetShortLinkContext
): Promise<MeetShortLinksState> {
  const now = nowOf(ctx);
  await ctx.repo.purgeExpired(ctx.meetingId, new Date(now).toISOString());
  // Links stay listed after a plan change so managers can still remove them;
  // the share surface uses them only while the meeting is eligible.
  const rows = (await ctx.repo.list(ctx.meetingId)).filter(
    (row) => !isMeetLinkExpired(row.expiresAt, now)
  );
  const clicks = rows.length
    ? await ctx.repo.clicks(rows.map((r) => r.id))
    : {};
  return {
    eligible: ctx.eligible,
    staff: ctx.staff,
    canonicalUrl: meetCanonicalJoinUrl(ctx.wsId, ctx.meetingId),
    links: rows.map((row) => view(ctx, row, clicks)),
  };
}

async function assertRate(ctx: MeetShortLinkContext, kind: MeetShortLinkKind) {
  const limit =
    kind === 'generated'
      ? MEET_GENERATED_PER_HOUR
      : MEET_VANITY_CHANGES_PER_HOUR;
  const since = new Date(nowOf(ctx) - HOUR_MS).toISOString();
  if ((await ctx.repo.recentActions(ctx.actorId, kind, since)) >= limit)
    throw new MeetShortLinkError('rate_limited');
}

function checkVanity(slug: string) {
  const error = validateVanitySlug(slug);
  if (error === 'reserved') throw new MeetShortLinkError('reserved_slug');
  if (error) throw new MeetShortLinkError('invalid_slug');
}

/**
 * Return the meeting's generated link, creating or renewing it. Only staff
 * may store it without the `meet/` prefix or toggle the prefix; an omitted
 * `prefixed` keeps the current form (prefixed for a new link).
 */
export async function ensureGeneratedMeetShortLink(
  ctx: MeetShortLinkContext,
  { prefixed: asked }: { prefixed?: boolean } = {}
): Promise<MeetShortLinkView> {
  if (!ctx.eligible) throw new MeetShortLinkError('not_eligible');
  if (asked === false && !ctx.staff) throw new MeetShortLinkError('staff_only');
  const requested = ctx.staff ? asked : undefined;
  const now = nowOf(ctx);
  const expiresAt = meetGeneratedExpiry(ctx.meetingTime, now);
  const existing = (await ctx.repo.list(ctx.meetingId)).find(
    (row) => row.kind === 'generated'
  );

  if (existing) {
    const current = meetSlugCode(existing.slug);
    const prefixed = requested ?? current.prefixed;
    // Renew at most daily, so opening the share dialog rarely writes.
    const renew =
      Date.parse(expiresAt) - Date.parse(existing.expiresAt) > DAY_MS ||
      isMeetLinkExpired(existing.expiresAt, now);
    if (current.prefixed === prefixed && !renew)
      return view(ctx, existing, await ctx.repo.clicks([existing.id]));
    if (current.prefixed !== prefixed) await assertRate(ctx, 'generated');
    for (let attempt = 0; attempt < GENERATE_ATTEMPTS; attempt += 1) {
      const slug =
        current.prefixed === prefixed
          ? existing.slug
          : meetStoredSlug(
              attempt === 0 ? current.code : generateMeetShortCode(),
              prefixed
            );
      // A prefix change is a staff action, so the staff member becomes the
      // creator the database guard checks for a root-level code.
      // An unchanged slug stays out of the update, so a renewal never
      // re-runs the staff check for a root-level code.
      const updated = await ctx.repo.update(
        existing.id,
        ctx.meetingId,
        slug === existing.slug
          ? { expiresAt }
          : { slug, expiresAt, creatorId: ctx.actorId }
      );
      if (updated === 'taken') continue;
      if (!updated) throw new MeetShortLinkError('not_found');
      if (slug !== existing.slug)
        await ctx.repo.audit({
          wsId: ctx.wsId,
          meetingId: ctx.meetingId,
          actorId: ctx.actorId,
          action: 'update',
          kind: 'generated',
          slug,
          previousSlug: existing.slug,
        });
      return view(ctx, updated, await ctx.repo.clicks([updated.id]));
    }
    throw new MeetShortLinkError('unavailable');
  }

  await assertRate(ctx, 'generated');
  for (let attempt = 0; attempt < GENERATE_ATTEMPTS; attempt += 1) {
    const slug = meetStoredSlug(generateMeetShortCode(), requested ?? true);
    const created = await ctx.repo.insert({
      slug,
      kind: 'generated',
      link: meetCanonicalJoinUrl(ctx.wsId, ctx.meetingId),
      creatorId: ctx.actorId,
      wsId: ctx.wsId,
      meetingId: ctx.meetingId,
      expiresAt,
    });
    if (created === 'limit') throw new MeetShortLinkError('unavailable');
    if (created === 'taken') {
      // A parallel request may have created the meeting's generated link.
      const raced = (await ctx.repo.list(ctx.meetingId)).find(
        (row) => row.kind === 'generated'
      );
      if (raced) return view(ctx, raced, {});
      continue;
    }
    await ctx.repo.audit({
      wsId: ctx.wsId,
      meetingId: ctx.meetingId,
      actorId: ctx.actorId,
      action: 'create',
      kind: 'generated',
      slug,
    });
    return view(ctx, created, {});
  }
  throw new MeetShortLinkError('unavailable');
}

export async function createVanityMeetShortLink(
  ctx: MeetShortLinkContext,
  { slug: code, prefixed = false }: { slug: string; prefixed?: boolean }
): Promise<MeetShortLinkView> {
  if (!ctx.staff) throw new MeetShortLinkError('staff_only');
  if (!ctx.eligible) throw new MeetShortLinkError('not_eligible');
  checkVanity(code);
  await assertRate(ctx, 'vanity');
  const rows = await ctx.repo.list(ctx.meetingId);
  if (
    rows.filter((row) => row.kind === 'vanity').length >=
    MEET_VANITY_PER_MEETING
  )
    throw new MeetShortLinkError('vanity_limit');
  const slug = meetStoredSlug(code, prefixed);
  const created = await ctx.repo.insert({
    slug,
    kind: 'vanity',
    link: meetCanonicalJoinUrl(ctx.wsId, ctx.meetingId),
    creatorId: ctx.actorId,
    wsId: ctx.wsId,
    meetingId: ctx.meetingId,
    expiresAt: meetVanityExpiry(nowOf(ctx)),
  });
  if (created === 'taken') throw new MeetShortLinkError('taken');
  if (created === 'limit') throw new MeetShortLinkError('vanity_limit');
  await ctx.repo.audit({
    wsId: ctx.wsId,
    meetingId: ctx.meetingId,
    actorId: ctx.actorId,
    action: 'create',
    kind: 'vanity',
    slug,
  });
  return view(ctx, created, {});
}

async function ownedRow(ctx: MeetShortLinkContext, linkId: string) {
  const row = (await ctx.repo.list(ctx.meetingId)).find((r) => r.id === linkId);
  if (!row) throw new MeetShortLinkError('not_found');
  return row;
}

/** Rename a staff member's own vanity slug; the edit renews its expiry. */
export async function updateVanityMeetShortLink(
  ctx: MeetShortLinkContext,
  linkId: string,
  { slug: code, prefixed = false }: { slug: string; prefixed?: boolean }
): Promise<MeetShortLinkView> {
  if (!ctx.staff) throw new MeetShortLinkError('staff_only');
  const row = await ownedRow(ctx, linkId);
  if (row.kind !== 'vanity' || row.creatorId !== ctx.actorId)
    throw new MeetShortLinkError('forbidden');
  checkVanity(code);
  await assertRate(ctx, 'vanity');
  const slug = meetStoredSlug(code, prefixed);
  const updated = await ctx.repo.update(row.id, ctx.meetingId, {
    slug,
    expiresAt: meetVanityExpiry(nowOf(ctx)),
  });
  if (updated === 'taken') throw new MeetShortLinkError('taken');
  if (!updated) throw new MeetShortLinkError('not_found');
  await ctx.repo.audit({
    wsId: ctx.wsId,
    meetingId: ctx.meetingId,
    actorId: ctx.actorId,
    action: 'update',
    kind: 'vanity',
    slug,
    previousSlug: row.slug,
  });
  return view(ctx, updated, await ctx.repo.clicks([updated.id]));
}

export async function deleteMeetShortLink(
  ctx: MeetShortLinkContext,
  linkId: string
): Promise<void> {
  const row = await ownedRow(ctx, linkId);
  if (!canDelete(ctx, row)) throw new MeetShortLinkError('forbidden');
  if (!(await ctx.repo.remove(row.id, ctx.meetingId)))
    throw new MeetShortLinkError('not_found');
  await ctx.repo.audit({
    wsId: ctx.wsId,
    meetingId: ctx.meetingId,
    actorId: ctx.actorId,
    action: 'delete',
    kind: row.kind,
    slug: row.slug,
  });
}
