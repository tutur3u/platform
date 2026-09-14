import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type LettinNode = {
  type: string;
  text?: string;
  attrs?: { level?: number };
  marks?: { type: string }[];
  content?: LettinNode[];
};
export type LettinDraft = {
  title: string;
  description: string;
  image: string;
  credit: string;
  kind: 'page' | 'character' | 'location' | 'lore' | 'story';
  tags: string[];
  links: string[];
  content: LettinNode;
};
export type LettinRecord = {
  id: string;
  draft: LettinDraft;
  published: LettinDraft | null;
  version: number;
  published_at: string | null;
};
export type LettinRole = 'owner' | 'editor' | 'publisher';
export type LettinOverview = {
  approved: boolean;
  canCreate: boolean;
  isAdmin: boolean;
  canInvite: boolean;
  worlds: (LettinRecord & { role: LettinRole })[];
  invitations: { id: string; email: string; expires_at: string }[];
  creators: {
    user_id: string;
    name: string | null;
    can_invite: boolean;
    enabled: boolean;
  }[];
};
export type LettinWorld = {
  world: LettinRecord;
  role: LettinRole;
  entries: LettinRecord[];
  collaborators: {
    user_id: string;
    name: string | null;
    role: 'editor' | 'publisher';
  }[];
  eligibleMembers: { user_id: string; name: string | null }[];
};
export type LettinPublicWorld = {
  id: string;
  creatorId: string;
  published: LettinDraft;
  entries: { id: string; published: LettinDraft }[];
};
export type LettinCommand =
  | { action: 'createWorld'; draft: LettinDraft }
  | { action: 'createEntry'; worldId: string; draft: LettinDraft }
  | {
      action: 'saveWorld';
      worldId: string;
      version: number;
      draft: LettinDraft;
    }
  | {
      action: 'saveEntry';
      worldId: string;
      entryId: string;
      version: number;
      draft: LettinDraft;
    }
  | {
      action: 'publishWorld' | 'unpublishWorld';
      worldId: string;
      version: number;
    }
  | {
      action: 'publishEntry' | 'unpublishEntry';
      worldId: string;
      entryId: string;
      version: number;
    }
  | { action: 'invite'; email: string }
  | { action: 'acceptInvitation'; invitationId: string }
  | { action: 'revokeInvitation'; invitationId: string }
  | {
      action: 'setCreator';
      userId: string;
      canInvite: boolean;
      enabled: boolean;
    }
  | {
      action: 'setCollaborator';
      worldId: string;
      userId: string;
      role: 'editor' | 'publisher';
    }
  | { action: 'removeCollaborator'; worldId: string; userId: string };
function client(options: InternalApiClientOptions = {}) {
  const baseUrl =
    options.baseUrl ??
    (typeof window === 'undefined'
      ? process.env.LETTIN_APP_URL ||
        process.env.NEXT_PUBLIC_LETTIN_APP_URL ||
        'https://lettin.tuturuuu.com'
      : undefined);
  return getInternalApiClient({ ...options, baseUrl });
}
const path = (wsId: string) =>
  `/api/v1/workspaces/${encodePathSegment(wsId)}/lettin`;
export function getLettinOverview(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return client(options).json<LettinOverview>(path(wsId), {
    cache: 'no-store',
  });
}
export function getLettinWorld(
  wsId: string,
  worldId: string,
  options?: InternalApiClientOptions
) {
  return client(options).json<LettinWorld>(path(wsId), {
    cache: 'no-store',
    query: { worldId },
  });
}
export function mutateLettin(
  wsId: string,
  command: LettinCommand,
  options?: InternalApiClientOptions
) {
  return client(options).json<{ id: string }>(path(wsId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
}
export function getLettinPublicWorlds(
  worldId?: string,
  options?: InternalApiClientOptions
) {
  return client(options).json<LettinPublicWorld[]>('/api/v1/lettin/worlds', {
    cache: 'no-store',
    query: { worldId },
  });
}
export function uploadLettinArtwork(wsId: string, worldId: string, file: File) {
  const body = new FormData();
  body.set('worldId', worldId);
  body.set('file', file);
  return client().json<{ image: string }>(`${path(wsId)}/media`, {
    method: 'POST',
    body,
  });
}
