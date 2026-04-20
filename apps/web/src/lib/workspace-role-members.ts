export interface NormalizedRoleMember {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

interface RawUserPrivateDetails {
  email: string | null;
}

interface RawRoleMemberUser {
  id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  user_private_details?: RawUserPrivateDetails | RawUserPrivateDetails[] | null;
}

interface RawRoleMemberRecord {
  user_id: string;
  users?: RawRoleMemberUser | RawRoleMemberUser[] | null;
}

function normalizeRoleMemberUser(
  rawUser: RawRoleMemberUser | RawRoleMemberUser[] | null | undefined,
  fallbackUserId: string
) {
  const user = Array.isArray(rawUser) ? rawUser[0] : rawUser;
  const privateDetails = Array.isArray(user?.user_private_details)
    ? user.user_private_details[0]
    : user?.user_private_details;

  return {
    id: user?.id ?? fallbackUserId,
    display_name: user?.display_name ?? null,
    avatar_url: user?.avatar_url ?? null,
    email: privateDetails?.email ?? null,
  };
}

export function normalizeRoleMembers(
  rawMembers: RawRoleMemberRecord[] | null | undefined
): NormalizedRoleMember[] {
  if (!Array.isArray(rawMembers)) {
    return [];
  }

  return rawMembers
    .map((member) => normalizeRoleMemberUser(member.users, member.user_id))
    .filter((member) => Boolean(member.id));
}
