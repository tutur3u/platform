import type {
  SupabaseClient,
  TypedSupabaseClient,
} from '@tuturuuu/supabase/types';
import type {
  Database,
  ExternalProjectDeliveryPayload,
  ExternalProjectEntry,
  Json,
} from '@tuturuuu/types';
import { assetPublicationProofs } from './asset-publication-store';
import { invalidateWorkspaceExternalProjectCache } from './cache';
import {
  type AssetPublicationManifest,
  assetPublicationProofId,
  publicationEventId,
} from './published-assets';

type EventKind = 'publish' | 'preview' | 'unpublish';

type PendingPublication = {
  entry: ExternalProjectEntry;
  manifest: AssetPublicationManifest;
};

export function includePendingPublication(
  entries: ExternalProjectEntry[],
  pending: ExternalProjectEntry
) {
  const index = entries.findIndex((entry) => entry.id === pending.id);
  if (index < 0) entries.push(pending);
  else entries[index] = pending;
  entries.sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id)
  );
}

type PublicationInput = {
  actorId: string;
  canonicalProjectId: string;
  entryId: string;
  eventKind: EventKind;
  visibilityScope: string;
  workspaceId: string;
  readPayload: (
    pending?: PendingPublication
  ) => Promise<ExternalProjectDeliveryPayload>;
  readManifest: (
    entry: ExternalProjectEntry
  ) => Promise<AssetPublicationManifest>;
};

type PublishArgs = {
  p_actor_id: string;
  p_asset_revisions: Json;
  p_canonical_project_id: string;
  p_entry_id: string;
  p_event_id: string;
  p_expected_updated_at: string;
  p_payload: Json;
  p_published_at: string;
  p_ws_id: string;
};

type AtomicPublicationDatabase = Omit<Database, 'public'> & {
  public: Database['public'] & {
    Functions: {
      publish_external_project_entry: {
        Args: PublishArgs;
        Returns: ExternalProjectEntry;
      };
    };
  };
};

export class PublicationDatabaseError extends Error {
  readonly code: string;

  constructor(
    readonly operation: string,
    error: { code?: string; message: string }
  ) {
    super(
      error.message
        .slice(0, 2048)
        .replace(/https?:\/\/\S+/gi, '[redacted]')
        .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
        .replace(/(["'])(?:\\.|(?!\1)[^\r\n])*\1/g, '[redacted]')
        .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+/g, '[redacted]')
        .replace(/\b[\w-]{24,}(?:\.[\w-]+)*/g, '[redacted]')
        .replace(/[^\x20-\x7E]/g, ' ')
        .slice(0, 280)
    );
    const code = error.code ?? '';
    this.code = /^[A-Z0-9]{5,8}$/.test(code) ? code : 'UNKNOWN';
  }
}

// PostgREST encodes UTC timestamps with an explicit offset and omits trailing
// fractional zeros. Use the same representation when deriving the event ID.
function publicationTimestamp(millis: number) {
  return new Date(millis)
    .toISOString()
    .replace(/(\.\d*?[1-9])0+Z$|\.000Z$|Z$/, '$1+00:00');
}

async function hasPublicationReceipt(
  admin: TypedSupabaseClient,
  current: ExternalProjectEntry,
  { workspaceId, canonicalProjectId }: PublicationInput
) {
  const publishedAt = current.published_at;
  if (current.status !== 'published' || !publishedAt) return false;

  const [event, proof] = await Promise.all([
    admin
      .from('workspace_external_project_publish_events')
      .select('id')
      .eq('ws_id', workspaceId)
      .eq('canonical_external_project_id', canonicalProjectId)
      .eq('entry_id', current.id)
      .eq('event_kind', 'publish')
      .eq('visibility_scope', 'public')
      .eq(
        'id',
        publicationEventId(
          workspaceId,
          canonicalProjectId,
          current.id,
          'publish',
          publishedAt
        )
      )
      .maybeSingle(),
    assetPublicationProofs(admin)
      .select('id')
      .eq('ws_id', workspaceId)
      .eq('canonical_external_project_id', canonicalProjectId)
      .eq('entry_id', current.id)
      .eq('published_at', publishedAt)
      .eq('entry_updated_at', current.updated_at)
      .eq(
        'id',
        assetPublicationProofId(workspaceId, canonicalProjectId, current)
      )
      .maybeSingle(),
  ]);
  if (event.error)
    throw new PublicationDatabaseError('read event', event.error);
  if (proof.error)
    throw new PublicationDatabaseError('read proof', proof.error);
  return Boolean(event.data && proof.data);
}

async function publishAtomically(
  admin: TypedSupabaseClient,
  current: ExternalProjectEntry,
  input: PublicationInput
) {
  if (await hasPublicationReceipt(admin, current, input)) return current;

  const { actorId, canonicalProjectId, workspaceId } = input;
  const previous = current.published_at ? Date.parse(current.published_at) : 0;
  const publishedAt = publicationTimestamp(Math.max(Date.now(), previous + 1));
  const entry: ExternalProjectEntry = {
    ...current,
    status: 'published',
    published_at: publishedAt,
    updated_by: actorId,
  };
  const manifest = await input.readManifest(entry);
  const payload = await input.readPayload({ entry, manifest });
  const rpc = admin as unknown as SupabaseClient<AtomicPublicationDatabase>;
  const result = await rpc
    .rpc('publish_external_project_entry', {
      p_actor_id: actorId,
      p_asset_revisions: manifest,
      p_canonical_project_id: canonicalProjectId,
      p_entry_id: current.id,
      p_event_id: publicationEventId(
        workspaceId,
        canonicalProjectId,
        current.id,
        'publish',
        publishedAt
      ),
      p_expected_updated_at: current.updated_at,
      p_payload: payload as unknown as Json,
      p_published_at: publishedAt,
      p_ws_id: workspaceId,
    })
    .single();

  if (result.error)
    throw new PublicationDatabaseError('atomic publish', result.error);
  return result.data;
}

export async function recordEntryPublication(
  admin: TypedSupabaseClient,
  input: PublicationInput
) {
  const {
    actorId,
    canonicalProjectId,
    entryId,
    eventKind,
    visibilityScope,
    workspaceId,
  } = input;
  const entries = () => admin.from('workspace_external_project_entries');
  const events = () => admin.from('workspace_external_project_publish_events');
  const { data: current, error: readError } = await entries()
    .select('*')
    .eq('ws_id', workspaceId)
    .eq('id', entryId)
    .single();
  if (readError) throw new PublicationDatabaseError('read entry', readError);

  if (eventKind === 'publish') {
    if (visibilityScope !== 'public')
      throw new Error('Invalid publish visibility');
    const published = await publishAtomically(admin, current, input);
    await invalidateWorkspaceExternalProjectCache(workspaceId);
    return published;
  }

  let entry = current;
  if (eventKind === 'unpublish' && current.status !== 'draft') {
    const { data: updated, error: writeError } = await entries()
      .update({
        published_at: null,
        status: 'draft',
        updated_by: actorId,
      })
      .eq('ws_id', workspaceId)
      .eq('id', entryId)
      .eq('updated_at', current.updated_at)
      .select('*')
      .single();
    if (writeError)
      throw new PublicationDatabaseError('withdraw entry', writeError);
    entry = updated;
  }

  try {
    let id: string | undefined;
    if (eventKind === 'unpublish') {
      id = publicationEventId(
        workspaceId,
        canonicalProjectId,
        entry.id,
        eventKind,
        entry.updated_at
      );
      const { data: recorded, error } = await events()
        .select('id')
        .eq('id', id)
        .eq('ws_id', workspaceId)
        .eq('canonical_external_project_id', canonicalProjectId)
        .eq('entry_id', entry.id)
        .eq('event_kind', eventKind)
        .maybeSingle();
      if (error)
        throw new PublicationDatabaseError('read withdrawal event', error);
      if (recorded) return entry;
    }

    const payload = await input.readPayload();
    const event = {
      ...(id ? { id } : {}),
      canonical_external_project_id: canonicalProjectId,
      entry_id: entry.id,
      event_kind: eventKind,
      payload: payload as unknown as NonNullable<Json>,
      profile_data: payload.profileData as NonNullable<Json>,
      triggered_by: actorId,
      visibility_scope: visibilityScope,
      ws_id: workspaceId,
    };
    const { error } = await (id
      ? events().upsert(event, { ignoreDuplicates: true, onConflict: 'id' })
      : events().insert(event));
    if (error) throw new PublicationDatabaseError('write event', error);
    return entry;
  } finally {
    if (eventKind === 'unpublish')
      await invalidateWorkspaceExternalProjectCache(workspaceId);
  }
}
