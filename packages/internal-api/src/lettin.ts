import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type LettinNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: LettinNode[];
};
export type LettinKind =
  | 'page'
  | 'character'
  | 'location'
  | 'lore'
  | 'story'
  | 'world'
  | 'event'
  | 'role'
  | 'organization';
export type LettinRelationshipKind =
  | 'related'
  | 'family'
  | 'friend'
  | 'rival'
  | 'member'
  | 'located'
  | 'part'
  | 'role'
  | 'appears';
export type LettinWiki = {
  aliases: string[];
  facts: { label: string; value: string }[];
  chronology?: { order: number; label: string; era: string };
  relationships: {
    targetId: string;
    kind: LettinRelationshipKind;
    label: string;
  }[];
};
export type LettinTheme = {
  palette: 'paper' | 'forest' | 'midnight' | 'rose';
  typography: 'editorial' | 'clean';
  motion: 'full' | 'reduced';
};
export type LettinArtwork = {
  image: string;
  alt: string;
  caption: string;
  credit: string;
};
export type LettinCreationGuidance = {
  credits: string;
  usageNotes: string;
  collaboration: 'unspecified' | 'ask-first' | 'open' | 'closed';
};
export type LettinWorkProgress =
  | 'unstarted'
  | 'drafting'
  | 'revising'
  | 'ready';
export type LettinDraft = {
  workProgress?: LettinWorkProgress;
  gallery?: LettinArtwork[];
  creationGuidance?: LettinCreationGuidance;
  contentNotice?: string;
  theme?: LettinTheme;
  title: string;
  description: string;
  image: string;
  credit: string;
  kind: LettinKind;
  wiki?: LettinWiki;
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
  canImportExocorpse?: boolean;
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
      action: 'duplicateEntry';
      worldId: string;
      entryId: string;
      version: number;
      title: string;
    }
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
export function uploadLettinArtwork(
  wsId: string,
  worldId: string,
  file: File,
  options?: InternalApiClientOptions
) {
  const body = new FormData();
  body.set('worldId', worldId);
  body.set('file', file);
  return client(options).json<{ image: string }>(`${path(wsId)}/media`, {
    method: 'POST',
    body,
  });
}

export type LettinImportPreview = {
  id: string;
  title: string;
  count: number;
  blacklistCount: number;
  skipped: number;
  kinds: Record<string, number>;
  entries: { title: string; kind: LettinKind }[];
};
export function previewLettinExocorpseImport(
  wsId: string,
  payload: { title: string; source: 'cms' | 'file'; payload?: unknown }
) {
  return client().json<LettinImportPreview>(`${path(wsId)}/exocorpse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'preview', ...payload }),
  });
}
export function applyLettinExocorpseImport(wsId: string, previewId: string) {
  return client().json<{ id: string }>(`${path(wsId)}/exocorpse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'apply', previewId }),
  });
}

export type LettinSavedNotebook = {
  worldId: string;
  savedAt: string;
  notebook: {
    title: string;
    description: string;
    image: string;
    credit: string;
  } | null;
};
export function getLettinSavedNotebooks(expectedActor: string) {
  return client().json<LettinSavedNotebook[]>('/api/v1/lettin/bookmarks', {
    query: { expectedActor },
    cache: 'no-store',
  });
}
export function getLettinNotebookSaved(worldId: string, expectedActor: string) {
  return client().json<{ saved: boolean }>('/api/v1/lettin/bookmarks', {
    cache: 'no-store',
    query: { worldId, expectedActor },
  });
}
export function setLettinNotebookSaved(
  worldId: string,
  saved: boolean,
  expectedActor: string
) {
  return client().json<{ saved: boolean }>('/api/v1/lettin/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ worldId, saved, expectedActor }),
  });
}

export type LettinNotebookExport = {
  format: 'lettin-notebook';
  version: 1;
  scope: 'published' | 'draft';
  exportedAt: string;
  world: { id: string; document: LettinDraft };
  entries: { id: string; document: LettinDraft }[];
};
export function exportLettinNotebook(
  wsId: string,
  options: {
    worldId: string;
    scope: 'published' | 'draft';
    privateConsent: boolean;
    expectedActor: string;
  }
) {
  return client().json<LettinNotebookExport>(`${path(wsId)}/export`, {
    cache: 'no-store',
    query: {
      worldId: options.worldId,
      scope: options.scope,
      privateConsent: options.privateConsent ? '1' : '0',
      expectedActor: options.expectedActor,
    },
  });
}

export const EXOCORPSE_WORKSPACE_ID = '3385bd92-3d5e-42f6-b3ad-0d1394af3509';
export const exocorpseWikiCollections = [
  'stories',
  'worlds',
  'characters',
  'factions',
  'locations',
  'timelines',
  'events',
  'character-outfits',
  'character-gallery',
  'location-gallery',
  'character-relationships',
  'character-factions',
  'character-locations',
  'outfit-types',
  'event-types',
  'relationship-types',
  'roles',
  'about',
  'about-content',
  'about-faqs',
  'portfolio-art',
  'portfolio-writing',
  'commission-services',
  'commission-addons',
  'commission-styles',
  'commission-pictures',
  'commission-blacklist',
  'tags',
];
export type LettinBlacklistItem = {
  id: string;
  displayName: string;
  reason: string;
  referenceUrl: string;
  sourceId: string | null;
};
export function getLettinBlacklist(wsId: string) {
  return client().json<LettinBlacklistItem[]>(`${path(wsId)}/moderation`, {
    cache: 'no-store',
  });
}
export function mutateLettinBlacklist(
  wsId: string,
  command:
    | {
        action: 'save';
        id?: string;
        draft: Pick<
          LettinBlacklistItem,
          'displayName' | 'reason' | 'referenceUrl'
        >;
      }
    | { action: 'remove'; id: string }
) {
  return client().json<{ id: string }>(`${path(wsId)}/moderation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
}

export type LettinCreatorAbout = {
  shared?: boolean;
  headline: string;
  pronouns: string;
  location: string;
  interests: string[];
  links: { label: string; url: string }[];
  content: LettinNode;
  theme: LettinTheme;
};
export function getLettinCreatorAbout(wsId: string) {
  return client().json<LettinCreatorAbout>(`${path(wsId)}/profile`, {
    cache: 'no-store',
  });
}
export function saveLettinCreatorAbout(
  wsId: string,
  details: LettinCreatorAbout
) {
  return client().json<LettinCreatorAbout>(`${path(wsId)}/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
  });
}

export type LettinSavedCreator = {
  creatorId: string;
  savedAt: string;
  notebookTitle: string | null;
};
export function getLettinSavedCreators(expectedActor: string) {
  return client().json<LettinSavedCreator[]>(
    `/api/v1/lettin/creator-bookmarks?${new URLSearchParams({ expectedActor })}`,
    { cache: 'no-store' }
  );
}
export function getLettinCreatorSaved(
  creatorId: string,
  expectedActor: string
) {
  return client().json<{ saved: boolean }>(
    `/api/v1/lettin/creator-bookmarks?${new URLSearchParams({ creatorId, expectedActor })}`,
    { cache: 'no-store' }
  );
}
export function setLettinCreatorSaved(
  creatorId: string,
  saved: boolean,
  expectedActor: string
) {
  return client().json<{ saved: boolean }>('/api/v1/lettin/creator-bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creatorId, saved, expectedActor }),
  });
}

export function previewLettinNotebookImport(
  wsId: string,
  input: {
    expectedActor: string;
    title: string;
    payload: unknown;
    consent: true;
  }
) {
  return client().json<LettinImportPreview>(`${path(wsId)}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'preview', ...input }),
  });
}
export function applyLettinNotebookImport(
  wsId: string,
  input: { expectedActor: string; previewId: string; consent: true }
) {
  return client().json<{ id: string }>(`${path(wsId)}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'apply', ...input }),
  });
}
