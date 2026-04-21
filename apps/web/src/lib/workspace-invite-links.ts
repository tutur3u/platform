export interface InviteLinkJoinedUser {
  id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  handle: string | null;
}

export interface RawInviteLinkUse {
  id: string;
  user_id: string;
  joined_at: string;
  user?: InviteLinkJoinedUser | null;
  users?: InviteLinkJoinedUser | InviteLinkJoinedUser[] | null;
}

export interface InviteLinkUse {
  id: string;
  user_id: string;
  joined_at: string;
  user: InviteLinkJoinedUser;
}

export type WorkspaceInviteLinkMemberType = 'MEMBER' | 'GUEST';

export interface InviteLinkSummary {
  id: string;
  ws_id: string;
  code: string;
  creator_id: string;
  max_uses: number | null;
  expires_at: string | null;
  created_at: string;
  current_uses: number;
  is_expired: boolean;
  is_full: boolean;
  /** People who use this link join as this membership type */
  memberType: WorkspaceInviteLinkMemberType;
}

export interface InviteLinkDetails extends InviteLinkSummary {
  uses: InviteLinkUse[];
}

export interface RawInviteLinkDetails {
  id: string | null;
  ws_id: string | null;
  code: string | null;
  creator_id: string | null;
  max_uses: number | null;
  expires_at: string | null;
  created_at: string | null;
  current_uses: number | null;
  is_expired: boolean | null;
  is_full: boolean | null;
  /** View `workspace_invite_links_with_stats` exposes `member_type`; legacy rows may use `type`. */
  member_type?: WorkspaceInviteLinkMemberType | null;
  type?: WorkspaceInviteLinkMemberType | null;
  uses?: RawInviteLinkUse[] | InviteLinkUse[] | null;
}

function normalizeInviteLinkJoinedUser(
  rawUser: InviteLinkJoinedUser | InviteLinkJoinedUser[] | null | undefined,
  fallbackUserId: string
): InviteLinkJoinedUser {
  const user = Array.isArray(rawUser) ? rawUser[0] : rawUser;

  return {
    id: user?.id ?? fallbackUserId,
    display_name: user?.display_name ?? null,
    avatar_url: user?.avatar_url ?? null,
    handle: user?.handle ?? null,
  };
}

export function normalizeInviteLinkUse(
  rawUse: RawInviteLinkUse
): InviteLinkUse {
  return {
    id: rawUse.id,
    user_id: rawUse.user_id,
    joined_at: rawUse.joined_at,
    user: normalizeInviteLinkJoinedUser(
      rawUse.user ?? rawUse.users,
      rawUse.user_id
    ),
  };
}

/** Resolve MEMBER vs GUEST from a stats view row (`member_type` preferred; legacy `type` supported). */
export function memberTypeFromInviteStatsRow(
  row: Record<string, unknown>
): WorkspaceInviteLinkMemberType {
  // API responses may already be normalized with camelCase `memberType`; re-parsing JSON drops snake_case keys.
  const v = row.member_type ?? row.type ?? row.memberType;
  if (v == null || v === '') return 'MEMBER';
  return String(v).toUpperCase() === 'GUEST' ? 'GUEST' : 'MEMBER';
}

/** Map a workspace_invite_links_with_stats row (`member_type` or legacy `type`) to summary shape */
export function mapInviteLinkRowFromApi(
  row: Record<string, unknown>
): InviteLinkSummary {
  const memberType = memberTypeFromInviteStatsRow(row);
  const raw: RawInviteLinkDetails = {
    id: row.id as string | null,
    ws_id: row.ws_id as string | null,
    code: row.code as string | null,
    creator_id: row.creator_id as string | null,
    max_uses: row.max_uses as number | null,
    expires_at: row.expires_at as string | null,
    created_at: row.created_at as string | null,
    current_uses: row.current_uses as number | null,
    is_expired: row.is_expired as boolean | null,
    is_full: row.is_full as boolean | null,
    type: memberType,
  };
  return {
    id: raw.id ?? '',
    ws_id: raw.ws_id ?? '',
    code: raw.code ?? '',
    creator_id: raw.creator_id ?? '',
    max_uses: raw.max_uses ?? null,
    expires_at: raw.expires_at ?? null,
    created_at: raw.created_at ?? '',
    current_uses: raw.current_uses ?? 0,
    is_expired: raw.is_expired ?? false,
    is_full: raw.is_full ?? false,
    memberType,
  };
}

export function normalizeInviteLinkDetails(
  rawDetails: RawInviteLinkDetails
): InviteLinkDetails {
  const uses = Array.isArray(rawDetails.uses)
    ? rawDetails.uses.map((use) =>
        normalizeInviteLinkUse(use as RawInviteLinkUse)
      )
    : [];

  return {
    ...mapInviteLinkRowFromApi(
      rawDetails as unknown as Record<string, unknown>
    ),
    uses,
  };
}
