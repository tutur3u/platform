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

export function normalizeInviteLinkDetails(
  rawDetails: RawInviteLinkDetails
): InviteLinkDetails {
  const uses = Array.isArray(rawDetails.uses)
    ? rawDetails.uses.map((use) =>
        normalizeInviteLinkUse(use as RawInviteLinkUse)
      )
    : [];

  return {
    id: rawDetails.id ?? '',
    ws_id: rawDetails.ws_id ?? '',
    code: rawDetails.code ?? '',
    creator_id: rawDetails.creator_id ?? '',
    max_uses: rawDetails.max_uses ?? null,
    expires_at: rawDetails.expires_at ?? null,
    created_at: rawDetails.created_at ?? '',
    current_uses: rawDetails.current_uses ?? 0,
    is_expired: rawDetails.is_expired ?? false,
    is_full: rawDetails.is_full ?? false,
    uses,
  };
}
