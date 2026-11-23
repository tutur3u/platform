import {
  encodePathSegment,
  getInternalApiClient,
} from '@tuturuuu/internal-api/client';

export type ContactAccountInvitationState =
  | 'pending'
  | 'expired'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'ineligible';

export type ContactAccountInvitation = {
  state: ContactAccountInvitationState;
  invitationId: string | null;
  accountId: string | null;
  updatedAt: string;
  expiresAt: string | null;
};

export type ContactAccountChoice = {
  id: string;
  display_name: string | null;
  email: string | null;
};

const api = getInternalApiClient();

// The same consent endpoint the mobile app uses for invite and revoke.
function linkPath(wsId: string) {
  return `/api/v1/workspaces/${encodePathSegment(wsId)}/users/links/repair`;
}

function post<T>(wsId: string, body: Record<string, string>) {
  return api.json<T>(linkPath(wsId), {
    body: JSON.stringify(body),
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

export async function readContactAccountInvitation(
  wsId: string,
  contactId: string
) {
  const query = new URLSearchParams({ workspaceUserId: contactId });
  const result = await api.json<{
    invitation: ContactAccountInvitation | null;
  }>(`${linkPath(wsId)}?${query}`, { cache: 'no-store' });
  return result.invitation;
}

export async function listContactAccountChoices(wsId: string) {
  const result = await api.json<{ members: ContactAccountChoice[] }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/members`,
    { cache: 'no-store' }
  );
  return result.members;
}

export async function inviteContactAccountHolder(
  wsId: string,
  contactId: string,
  accountId: string
) {
  const result = await post<{ outcome: string; invitationId?: string }>(wsId, {
    action: 'invite',
    workspaceUserId: contactId,
    platformAccountId: accountId,
  });
  if (result.outcome !== 'invited' || !result.invitationId) {
    throw new Error('Invalid account-link invitation result');
  }
  return result.invitationId;
}

export function revokeContactAccountInvitation(
  wsId: string,
  contactId: string
) {
  return post<{ outcome: string }>(wsId, {
    action: 'revoke',
    workspaceUserId: contactId,
  });
}

export function buildContactLinkInvitationUrl({
  contactId,
  invitationId,
  webAppUrl,
  wsId,
}: {
  contactId: string;
  invitationId: string;
  webAppUrl: string;
  wsId: string;
}) {
  const url = new URL('/contact-link', webAppUrl);
  url.search = new URLSearchParams({
    wsId,
    contactId,
    invitationId,
  }).toString();
  return url.toString();
}
