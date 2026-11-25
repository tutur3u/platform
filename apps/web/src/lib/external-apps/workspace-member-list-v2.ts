import { createHash } from 'node:crypto';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import {
  type ExternalAppWorkspaceMembersAccess,
  loadExternalAppWorkspaceMembers,
} from './workspace-members';

/**
 * Member-list read contract v2 for external apps (opt in with `?version=2`).
 *
 * v1 stays byte-compatible. v2 adds, per member, the authoritative
 * `membershipType` and an opaque `membershipRevision`, and per response a
 * list `revision`, `total`, cursor pagination and an explicit `complete`
 * marker. `complete: true` appears only on the final page of a cursor chain
 * whose every page was served at the same `revision`, and only when the
 * platform positively proved the member set exhaustive. Requests are
 * rate-limited by the external-app route-group guard as `GET members` reads.
 */
export const MEMBER_LIST_CONTRACT_VERSION = 2;
export const MEMBER_LIST_DEFAULT_PAGE_SIZE = 500;
export const MEMBER_LIST_MAX_PAGE_SIZE = 500;
/** PostgREST `max_rows`; any single unranged read at or above it may be cut. */
export const POSTGREST_MAX_ROWS = 1000;
/** Bounded authoritative scan: 20 ranged reads, 20,000 memberships. */
const MAX_MEMBERSHIP_SCAN_PAGES = 20;

type AdminDb = TypedSupabaseClient;
type V1Snapshot = Awaited<ReturnType<typeof loadExternalAppWorkspaceMembers>>;
type V1Member = V1Snapshot['members'][number];

export type MemberListIncompleteReason =
  | 'membership_scan_limit'
  | 'row_cap'
  | 'unresolved_members';

export type MemberListRequest =
  | { version: 1 }
  | {
      cursor: { offset: number; revision: string } | null;
      limit: number;
      version: 2;
    };

export type MembershipRow = {
  created_at: string;
  type: 'GUEST' | 'MEMBER';
  user_id: string;
};

function contractError(status: 400 | 409, code: string, message: string) {
  return NextResponse.json({ code, error: message }, { status });
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function encodeMemberListCursor(cursor: {
  offset: number;
  revision: string;
}) {
  return Buffer.from(
    JSON.stringify({ o: cursor.offset, r: cursor.revision, v: 2 })
  ).toString('base64url');
}

function decodeMemberListCursor(raw: string) {
  if (raw.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      parsed?.v !== 2 ||
      !Number.isSafeInteger(parsed.o) ||
      parsed.o < 0 ||
      typeof parsed.r !== 'string' ||
      parsed.r.length === 0 ||
      parsed.r.length > 128
    ) {
      return null;
    }
    return { offset: parsed.o as number, revision: parsed.r as string };
  } catch {
    return null;
  }
}

/** Parses the version, page size and cursor. Returns a 400 response on error. */
export function parseMemberListRequest(
  request: Request
): MemberListRequest | NextResponse {
  const params = new URL(request.url).searchParams;
  const version = params.get('version');

  if (version === null || version === '1') {
    return { version: 1 };
  }

  if (version !== String(MEMBER_LIST_CONTRACT_VERSION)) {
    return contractError(
      400,
      'UNSUPPORTED_VERSION',
      'Unsupported member list version'
    );
  }

  const rawLimit = params.get('limit');
  const limit =
    rawLimit === null ? MEMBER_LIST_DEFAULT_PAGE_SIZE : Number(rawLimit);

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MEMBER_LIST_MAX_PAGE_SIZE
  ) {
    return contractError(
      400,
      'INVALID_LIMIT',
      `limit must be an integer from 1 to ${MEMBER_LIST_MAX_PAGE_SIZE}`
    );
  }

  const rawCursor = params.get('cursor');
  const cursor = rawCursor === null ? null : decodeMemberListCursor(rawCursor);

  if (rawCursor !== null && !cursor) {
    return contractError(400, 'INVALID_CURSOR', 'Invalid cursor');
  }

  return { cursor, limit, version: 2 };
}

/**
 * Reads every direct membership row of one workspace with ranged reads, so the
 * PostgREST row cap cannot silently truncate it, and proves exhaustiveness
 * against an exact count taken by the first read.
 */
export async function scanWorkspaceMemberships(
  admin: AdminDb,
  wsId: string
): Promise<{ exhaustive: boolean; rows: MembershipRow[] }> {
  const rows: MembershipRow[] = [];
  let expected: number | null = null;

  for (let page = 0; page < MAX_MEMBERSHIP_SCAN_PAGES; page += 1) {
    const from = page * POSTGREST_MAX_ROWS;
    const { count, data, error } = await admin
      .from('workspace_members')
      .select(
        'user_id, type, created_at',
        page === 0 ? { count: 'exact' } : undefined
      )
      .eq('ws_id', wsId)
      .order('user_id', { ascending: true })
      .range(from, from + POSTGREST_MAX_ROWS - 1);

    if (error) throw error;
    if (page === 0) expected = count ?? null;

    rows.push(...((data ?? []) as MembershipRow[]));

    if ((data ?? []).length < POSTGREST_MAX_ROWS) {
      const unique = new Set(rows.map((row) => row.user_id)).size;
      return {
        exhaustive: expected === rows.length && unique === rows.length,
        rows,
      };
    }
  }

  return { exhaustive: false, rows };
}

/** Exact row count of the view the v1 snapshot reads without a range. */
async function countMemberAndInviteRows(admin: AdminDb, wsId: string) {
  const { count, error } = await admin
    .from('workspace_members_and_invites')
    .select('id', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  if (error) throw error;
  return count;
}

/**
 * Opaque per-membership revision. A removal followed by re-addition creates a
 * new membership row with a new `created_at`, so the revision changes even when
 * both happen between two observations; a MEMBER/GUEST change also changes it.
 */
export function membershipRevision(wsId: string, row: MembershipRow) {
  return `mr1_${sha256(
    [wsId, row.user_id, row.type, row.created_at].join('\n')
  ).slice(0, 32)}`;
}

type V2Member = V1Member & {
  membershipRevision: string;
  membershipType: MembershipRow['type'];
};

/** Caller-independent revision of everything membership-relevant in the list. */
export function memberListRevision({
  defaultAdminEnabled,
  invitations,
  members,
  wsId,
}: {
  defaultAdminEnabled: boolean;
  invitations: V1Snapshot['invitations'];
  members: V2Member[];
  wsId: string;
}) {
  const payload = JSON.stringify([
    wsId,
    defaultAdminEnabled,
    members.map((member) => [
      member.id,
      member.membershipType,
      member.membershipRevision,
      member.role,
      [...member.roleSources].sort(),
      member.isCreator,
    ]),
    invitations.map((invitation) => [invitation.email, invitation.createdAt]),
  ]);

  return `r1_${sha256(payload).slice(0, 32)}`;
}

export function buildMemberListV2Snapshot({
  memberships,
  rowCount,
  v1,
  wsId,
}: {
  memberships: { exhaustive: boolean; rows: MembershipRow[] };
  rowCount: number | null;
  v1: V1Snapshot;
  wsId: string;
}) {
  const enrichedById = new Map(v1.members.map((member) => [member.id, member]));
  const members: V2Member[] = [];
  let unresolved = 0;

  // Authoritative rows only: board guests and other non-membership rows that
  // the v1 snapshot may include are dropped here.
  for (const row of [...memberships.rows].sort((a, b) =>
    a.user_id.localeCompare(b.user_id)
  )) {
    const enriched = enrichedById.get(row.user_id);
    if (!enriched) {
      unresolved += 1;
      continue;
    }
    members.push({
      ...enriched,
      membershipRevision: membershipRevision(wsId, row),
      membershipType: row.type,
    });
  }

  // Emails are null unless the app holds the explicit email scope.
  const invitations = [...v1.invitations].sort(
    (a, b) =>
      (a.email ?? '').localeCompare(b.email ?? '') ||
      (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
  );

  const incompleteReason: MemberListIncompleteReason | null =
    !memberships.exhaustive
      ? 'membership_scan_limit'
      : rowCount === null || rowCount >= POSTGREST_MAX_ROWS
        ? 'row_cap'
        : unresolved > 0
          ? 'unresolved_members'
          : null;

  return {
    context: v1.context,
    incompleteReason,
    invitations,
    members,
    revision: memberListRevision({
      defaultAdminEnabled: v1.context.defaultAdminEnabled,
      invitations,
      members,
      wsId,
    }),
  };
}

export function paginateMemberListV2(
  snapshot: ReturnType<typeof buildMemberListV2Snapshot>,
  request: Extract<MemberListRequest, { version: 2 }>
) {
  const total = snapshot.members.length + snapshot.invitations.length;
  const offset = request.cursor?.offset ?? 0;

  if (request.cursor && request.cursor.revision !== snapshot.revision) {
    return NextResponse.json(
      {
        code: 'REVISION_CHANGED',
        error: 'Member list changed; restart from the first page',
        revision: snapshot.revision,
      },
      { status: 409 }
    );
  }

  if (offset > total) {
    return contractError(400, 'INVALID_CURSOR', 'Invalid cursor');
  }

  const end = Math.min(offset + request.limit, total);
  const memberCount = snapshot.members.length;
  const nextCursor =
    end < total
      ? encodeMemberListCursor({ offset: end, revision: snapshot.revision })
      : null;

  return NextResponse.json({
    complete: nextCursor === null && snapshot.incompleteReason === null,
    context: snapshot.context,
    ...(snapshot.incompleteReason
      ? { incompleteReason: snapshot.incompleteReason }
      : {}),
    invitations: snapshot.invitations.slice(
      Math.max(0, offset - memberCount),
      Math.max(0, end - memberCount)
    ),
    members: snapshot.members.slice(
      Math.min(offset, memberCount),
      Math.min(end, memberCount)
    ),
    nextCursor,
    revision: snapshot.revision,
    total,
    version: MEMBER_LIST_CONTRACT_VERSION,
  });
}

export async function loadExternalAppWorkspaceMemberListV2(
  access: ExternalAppWorkspaceMembersAccess,
  request: Extract<MemberListRequest, { version: 2 }>
) {
  const wsId = access.normalizedWorkspaceId;
  // Enrich first, then scan: a member added in between is unresolved (list
  // incomplete) and one removed in between is correctly absent, so a race can
  // only fail safe, never claim completeness while omitting a current member.
  const v1 = await loadExternalAppWorkspaceMembers(access);
  const memberships = await scanWorkspaceMemberships(access.admin, wsId);
  const rowCount = await countMemberAndInviteRows(access.admin, wsId);

  return paginateMemberListV2(
    buildMemberListV2Snapshot({ memberships, rowCount, v1, wsId }),
    request
  );
}
